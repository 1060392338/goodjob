import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type {
  LeadIngestionConnector,
  LeadIngestionPage,
  LeadIngestionPageRequest,
  RawLeadIngestionFields,
  RawLeadIngestionRecord
} from "../domain/leads/lead-ingestion-pipeline.js";

export type WebLeadTargetKind = "search" | "page";
export interface WebLeadTarget { url: string; kind: WebLeadTargetKind; }
export interface WebLeadPermissionEvidence { basis: string; reference: string; reviewedAt: string; }
export interface WebLeadDomainPolicy {
  hostname: string;
  permission: WebLeadPermissionEvidence;
  maxRequestsPerWindow: number;
  windowMs: number;
}
export interface WebLeadTransportRequest {
  url: string;
  method: "GET";
  headers: Record<string, string>;
  timeoutMs: number;
  maxResponseBytes: number;
  resolvedAddresses: string[];
}
export interface WebLeadTransportResponse { status: number; headers: Record<string, string>; body: Uint8Array; }
export interface WebLeadTransport { request(request: WebLeadTransportRequest): Promise<WebLeadTransportResponse>; }
export type WebLeadDnsResolver = (hostname: string) => Promise<string[]>;
export interface WebLeadDocument {
  url: string;
  targetKind: WebLeadTargetKind;
  contentType: string;
  text: string;
  fetchedAt: string;
  trust: "untrusted_external";
  instructionUse: "forbidden";
  promptInjectionSignals: string[];
}
export interface WebLeadExtractedRecord {
  externalId?: string;
  sourceUrl?: string;
  occurredAt?: string;
  fields: RawLeadIngestionFields;
}
export interface WebLeadExtractorResult { records: WebLeadExtractedRecord[]; discoveredTargets?: WebLeadTarget[]; }
export type WebLeadExtractor = (document: WebLeadDocument) => Promise<WebLeadExtractorResult>;
export interface WebLeadRateLimiter { consume(key: string, maximum: number, windowMs: number, nowMs: number): boolean; }

export class InMemoryWebLeadRateLimiter implements WebLeadRateLimiter {
  private readonly requests = new Map<string, number[]>();
  consume(key: string, maximum: number, windowMs: number, nowMs: number) {
    const after = nowMs - windowMs;
    const active = (this.requests.get(key) || []).filter((value) => value > after);
    if (active.length >= maximum) { this.requests.set(key, active); return false; }
    active.push(nowMs);
    this.requests.set(key, active);
    return true;
  }
}

export type WebLeadConnectorErrorCode =
  | "domain_not_allowed" | "dns_rejected" | "dns_rebinding" | "robots_unavailable"
  | "robots_disallowed" | "rate_limited" | "timeout" | "too_many_redirects"
  | "invalid_response" | "content_type_rejected" | "content_too_large"
  | "content_rejected" | "checkpoint_context_mismatch" | "invalid_configuration";

export class WebLeadConnectorError extends Error {
  constructor(public readonly code: WebLeadConnectorErrorCode, message: string) {
    super(message);
    this.name = "WebLeadConnectorError";
  }
}

export interface WebLeadIngestionConnectorOptions {
  id: string;
  tenantId: string;
  seeds: WebLeadTarget[];
  policies: WebLeadDomainPolicy[];
  resolver: WebLeadDnsResolver;
  transport: WebLeadTransport;
  extractor: WebLeadExtractor;
  rateLimiter: WebLeadRateLimiter;
  userAgent?: string;
  maxResponseBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  maxTargets?: number;
  now?: () => string;
}

interface RobotsRule { directive: "allow" | "disallow"; path: string; }
interface RobotsEvidence { url: string; digest: string; rules: RobotsRule[]; fetchedAt: string; }
interface ResolutionPin { hostname: string; addresses: string[]; }
interface WebCheckpoint {
  version: "web-v1";
  connectorId: string;
  tenantDigest: string;
  seedDigest: string;
  policyDigest: string;
  processed: number;
  pending: WebLeadTarget[];
  visited: string[];
  robots: Record<string, RobotsEvidence>;
  resolutionPins: Record<string, ResolutionPin>;
}
interface ValidatedUrl { url: URL; policy: WebLeadDomainPolicy; }
interface FetchedContent { url: string; contentType: string; body: Uint8Array; calls: number; }

const CHECKPOINT_VERSION = "web-v1" as const;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_TARGETS = 100;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const BODY_CONTENT_TYPES = new Set([...HTML_CONTENT_TYPES, "text/plain"]);
const ROBOTS_CONTENT_TYPES = new Set(["text/plain"]);

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
}
function digest(value: unknown) {
  const normalized = typeof value === "string" ? value : value instanceof Uint8Array ? value : stableJson(value);
  return createHash("sha256").update(normalized).digest("hex");
}
function compact(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " "); }
function normalizedContentType(headers: Record<string, string>) {
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] || "";
  return entry.split(";", 1)[0]!.trim().toLowerCase();
}
function headerValue(headers: Record<string, string>, wanted: string) {
  return Object.entries(headers).find(([name]) => name.toLowerCase() === wanted.toLowerCase())?.[1];
}
function toIpv4Number(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return (((parts[0]! * 256 + parts[1]!) * 256 + parts[2]!) * 256 + parts[3]!) >>> 0;
}
function ipv4InCidr(address: string, base: string, prefix: number) {
  const value = toIpv4Number(address); const network = toIpv4Number(base);
  if (value === undefined || network === undefined) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}
const REJECTED_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],
  ["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],["192.168.0.0",16],
  ["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]
];
function expandIpv6(address: string): number[] | undefined {
  if (address.includes("%")) return undefined;
  let source = address.toLowerCase();
  const mappedIndex = source.lastIndexOf(":"); const possibleIpv4 = source.slice(mappedIndex + 1);
  if (possibleIpv4.includes(".")) {
    const value = toIpv4Number(possibleIpv4); if (value === undefined) return undefined;
    source = `${source.slice(0, mappedIndex)}:${((value >>> 16) & 0xffff).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const pieces = source.split("::"); if (pieces.length > 2) return undefined;
  const left = pieces[0] ? pieces[0].split(":").filter(Boolean) : [];
  const right = pieces[1] ? pieces[1].split(":").filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if ((pieces.length === 1 && missing !== 0) || missing < 0) return undefined;
  const all = [...left, ...Array(pieces.length === 2 ? missing : 0).fill("0"), ...right];
  if (all.length !== 8 || all.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return undefined;
  return all.map((part) => Number.parseInt(part, 16));
}
function isPublicIpv6(address: string): boolean {
  const groups = expandIpv6(address); if (!groups) return false;
  if (groups.every((value) => value === 0)) return false;
  if (groups.slice(0, 7).every((value) => value === 0) && groups[7] === 1) return false;
  if ((groups[0]! & 0xfe00) === 0xfc00 || (groups[0]! & 0xffc0) === 0xfe80 || (groups[0]! & 0xff00) === 0xff00) return false;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;
  if (groups.slice(0, 5).every((value) => value === 0) && groups[5] === 0xffff) {
    return isPublicIp(`${groups[6]! >>> 8}.${groups[6]! & 0xff}.${groups[7]! >>> 8}.${groups[7]! & 0xff}`);
  }
  return true;
}
function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !REJECTED_IPV4_RANGES.some(([base, prefix]) => ipv4InCidr(address, base, prefix));
  if (family === 6) return isPublicIpv6(address);
  return false;
}
function canonicalTarget(target: WebLeadTarget): WebLeadTarget { return { url: target.url, kind: target.kind }; }
function equalArrays(left: string[], right: string[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, token: string) => {
    if (token[0] === "#") {
      const numeric = token[1]?.toLowerCase() === "x" ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
      return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : " ";
    }
    return named[token.toLowerCase()] || match;
  });
}
const DANGEROUS_ELEMENT_PATTERN = /<(script|style|noscript|template|iframe|object|embed|svg|math|form|input|button|textarea|select|option)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_VOID_PATTERN = /<(input|meta|link|base|embed)\b[^>]*\/?\s*>/gi;
const PROMPT_INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "ignore_previous_instructions", pattern: /\bignore\s+(?:all\s+)?previous\s+instructions\b[^.!?\n]*(?:[.!?]|$)/gi },
  { name: "override_prompt", pattern: /\boverride\s+(?:the\s+)?(?:system|developer)\s+prompt\b[^.!?\n]*(?:[.!?]|$)/gi },
  { name: "reveal_prompt", pattern: /\b(?:reveal|show|print)\s+(?:the\s+)?(?:system|developer)\s+prompt\b[^.!?\n]*(?:[.!?]|$)/gi },
  { name: "secret_exfiltration", pattern: /\b(?:reveal|send|print|return)\s+(?:all\s+)?(?:secrets?|passwords?|api\s*keys?|tokens?)\b[^.!?\n]*(?:[.!?]|$)/gi },
  { name: "role_override", pattern: /\b(?:act\s+as|you\s+are\s+now)\b[^.!?\n]*(?:[.!?]|$)/gi },
  { name: "tool_invocation", pattern: /\b(?:call|invoke|execute|run)\s+(?:a\s+)?(?:tool|shell|command)\b[^.!?\n]*(?:[.!?]|$)/gi }
];
function sanitizeExternalText(value: string, html: boolean) {
  let text = value;
  if (html) {
    let previous = "";
    while (previous !== text) {
      previous = text;
      text = text.replace(DANGEROUS_ELEMENT_PATTERN, " ").replace(DANGEROUS_VOID_PATTERN, " ");
    }
    text = text.replace(/<!--([\s\S]*?)-->/g, " ").replace(/<[^>]+>/g, " ");
  }
  text = decodeHtmlEntities(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
  const promptInjectionSignals: string[] = [];
  for (const detector of PROMPT_INJECTION_PATTERNS) {
    detector.pattern.lastIndex = 0;
    if (detector.pattern.test(text)) promptInjectionSignals.push(detector.name);
    detector.pattern.lastIndex = 0;
    text = text.replace(detector.pattern, " ");
  }
  return { text: compact(text), promptInjectionSignals };
}
function cleanField(value: unknown) { return sanitizeExternalText(compact(value), false).text; }
function parseRobots(body: string, userAgent: string): RobotsRule[] {
  type Group = { agents: string[]; rules: RobotsRule[] };
  const groups: Group[] = []; let current: Group | undefined; let sawRule = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim(); if (!line) continue;
    const separator = line.indexOf(":"); if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase(); const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!current || sawRule) { current = { agents: [], rules: [] }; groups.push(current); sawRule = false; }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) {
      sawRule = true; if (value || key === "allow") current.rules.push({ directive: key, path: value });
    }
  }
  const token = userAgent.toLowerCase().split(/[\s/]/, 1)[0]!;
  const exact = groups.filter((group) => group.agents.some((agent) => agent !== "*" && (token === agent || token.startsWith(agent))));
  const selected = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  return selected.flatMap((group) => group.rules);
}
function robotsDecision(rules: RobotsRule[], url: URL) {
  const path = `${url.pathname}${url.search}`;
  const matches = rules.filter((rule) => !rule.path || path.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length || (left.directive === "allow" ? -1 : 1));
  const matched = matches[0];
  return { allowed: !matched || matched.directive === "allow" || !matched.path, matchedRule: matched ? `${matched.directive}:${matched.path}` : "default:allow" };
}
function asCheckpoint(value: Record<string, unknown> | undefined): WebCheckpoint | undefined { return value as unknown as WebCheckpoint | undefined; }

export class WebLeadIngestionConnector implements LeadIngestionConnector {
  readonly sourceKind = "web" as const;
  readonly id: string;
  private readonly tenantId: string;
  private readonly seeds: WebLeadTarget[];
  private readonly policies: Map<string, WebLeadDomainPolicy>;
  private readonly resolver: WebLeadDnsResolver;
  private readonly transport: WebLeadTransport;
  private readonly extractor: WebLeadExtractor;
  private readonly rateLimiter: WebLeadRateLimiter;
  private readonly userAgent: string;
  private readonly maxResponseBytes: number;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly maxTargets: number;
  private readonly now: () => string;
  private readonly tenantDigest: string;
  private readonly seedDigest: string;
  private readonly policyDigest: string;

  constructor(options: WebLeadIngestionConnectorOptions) {
    this.id = compact(options.id); this.tenantId = compact(options.tenantId);
    this.resolver = options.resolver; this.transport = options.transport; this.extractor = options.extractor;
    this.rateLimiter = options.rateLimiter; this.userAgent = compact(options.userAgent || "GoodJobLeadBot/1.0");
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS; this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.maxTargets = options.maxTargets ?? DEFAULT_MAX_TARGETS; this.now = options.now || (() => new Date().toISOString());
    if (!this.id || !this.tenantId || !this.userAgent || !options.resolver || !options.transport || !options.extractor || !options.rateLimiter) {
      throw new WebLeadConnectorError("invalid_configuration", "Web Connector 配置不完整");
    }
    if (!Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes <= 0 || !Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 ||
        !Number.isInteger(this.maxRedirects) || this.maxRedirects < 0 || !Number.isInteger(this.maxTargets) || this.maxTargets <= 0) {
      throw new WebLeadConnectorError("invalid_configuration", "Web Connector 数值限制无效");
    }
    this.policies = new Map();
    for (const source of options.policies || []) {
      const hostname = compact(source.hostname).toLowerCase().replace(/\.$/, "");
      if (!hostname || this.policies.has(hostname)) throw new WebLeadConnectorError("invalid_configuration", "域名许可策略重复或无效");
      if (!source.permission || !compact(source.permission.basis) || !compact(source.permission.reference) ||
          !compact(source.permission.reviewedAt) || Number.isNaN(Date.parse(source.permission.reviewedAt))) {
        throw new WebLeadConnectorError("invalid_configuration", "域名 permission/许可依据不完整");
      }
      if (!Number.isInteger(source.maxRequestsPerWindow) || source.maxRequestsPerWindow <= 0 || !Number.isInteger(source.windowMs) || source.windowMs <= 0) {
        throw new WebLeadConnectorError("invalid_configuration", "域名限流策略无效");
      }
      this.policies.set(hostname, { hostname, permission: {
        basis: compact(source.permission.basis), reference: compact(source.permission.reference),
        reviewedAt: new Date(source.permission.reviewedAt).toISOString()
      }, maxRequestsPerWindow: source.maxRequestsPerWindow, windowMs: source.windowMs });
    }
    if (!this.policies.size) throw new WebLeadConnectorError("invalid_configuration", "至少需要一个域名许可策略");
    if (!Array.isArray(options.seeds) || !options.seeds.length || options.seeds.length > this.maxTargets) {
      throw new WebLeadConnectorError("invalid_configuration", "Web Connector 种子数量无效");
    }
    this.seeds = options.seeds.map((target) => this.validateConfiguredTarget(target));
    this.tenantDigest = digest(this.tenantId); this.seedDigest = digest(this.seeds.map(canonicalTarget));
    this.policyDigest = digest([...this.policies.values()].sort((a, b) => a.hostname.localeCompare(b.hostname)));
  }
  async fetchPage(request: LeadIngestionPageRequest): Promise<LeadIngestionPage> {
    const checkpoint = this.restoreCheckpoint(request);
    if (!checkpoint.pending.length) return { records: [], calls: 0, exhausted: true, nextCheckpoint: this.cloneCheckpoint(checkpoint) };
    const target = checkpoint.pending[0]!;
    const fetched = await this.fetchTarget(target, checkpoint);
    const sanitized = sanitizeExternalText(new TextDecoder("utf-8", { fatal: false }).decode(fetched.body), HTML_CONTENT_TYPES.has(fetched.contentType));
    if (!sanitized.text) throw new WebLeadConnectorError("content_rejected", "网页正文净化后为空");
    const fetchedAt = this.now();
    const document: WebLeadDocument = {
      url: fetched.url, targetKind: target.kind, contentType: fetched.contentType, text: sanitized.text, fetchedAt,
      trust: "untrusted_external", instructionUse: "forbidden", promptInjectionSignals: [...sanitized.promptInjectionSignals]
    };
    let extracted: WebLeadExtractorResult;
    try { extracted = await this.extractor(structuredClone(document)); }
    catch (error) { throw new WebLeadConnectorError("content_rejected", `Extractor 拒绝外部内容：${error instanceof Error ? error.message : String(error)}`); }
    if (!extracted || !Array.isArray(extracted.records)) throw new WebLeadConnectorError("content_rejected", "Extractor 返回格式无效");
    const origin = new URL(fetched.url).origin; const robots = checkpoint.robots[origin];
    if (!robots) throw new WebLeadConnectorError("robots_unavailable", "缺少 robots 决策证据");
    const decision = robotsDecision(robots.rules, new URL(fetched.url)); const policy = this.policyFor(new URL(fetched.url).hostname);
    const contentDigest = digest(fetched.body);
    const records = extracted.records.map((record, index) => this.toRawRecord(record, index, {
      target, fetched, fetchedAt, policy, robots, decision, contentDigest, promptInjectionSignals: sanitized.promptInjectionSignals
    }));
    const visited = [...new Set([...checkpoint.visited, target.url, fetched.url])]; const queued = checkpoint.pending.slice(1);
    for (const discovered of extracted.discoveredTargets || []) {
      const validated = this.validateConfiguredTarget(discovered);
      if (!visited.includes(validated.url) && !queued.some((item) => item.url === validated.url)) queued.push(validated);
    }
    if (visited.length + queued.length > this.maxTargets) throw new WebLeadConnectorError("content_rejected", "发现目标数量超过安全上限");
    const nextCheckpoint: WebCheckpoint = { ...checkpoint, processed: checkpoint.processed + 1, pending: queued, visited };
    const exhausted = queued.length === 0;
    return { records, calls: fetched.calls, exhausted, nextCursor: exhausted ? undefined : this.cursor(nextCheckpoint), nextCheckpoint: this.cloneCheckpoint(nextCheckpoint) };
  }

  private restoreCheckpoint(request: LeadIngestionPageRequest): WebCheckpoint {
    const supplied = asCheckpoint(request.checkpoint);
    if (!supplied) {
      if (request.cursor) throw new WebLeadConnectorError("checkpoint_context_mismatch", "cursor 缺少配套 checkpoint");
      return { version: CHECKPOINT_VERSION, connectorId: this.id, tenantDigest: this.tenantDigest, seedDigest: this.seedDigest,
        policyDigest: this.policyDigest, processed: 0, pending: structuredClone(this.seeds), visited: [], robots: {}, resolutionPins: {} };
    }
    if (supplied.version !== CHECKPOINT_VERSION || supplied.connectorId !== this.id || supplied.tenantDigest !== this.tenantDigest ||
        supplied.seedDigest !== this.seedDigest || supplied.policyDigest !== this.policyDigest) {
      throw new WebLeadConnectorError("checkpoint_context_mismatch", "Web Connector checkpoint 上下文不匹配");
    }
    if (!Number.isInteger(supplied.processed) || supplied.processed < 0 || !Array.isArray(supplied.pending) || !Array.isArray(supplied.visited) ||
        !supplied.robots || typeof supplied.robots !== "object" || !supplied.resolutionPins || typeof supplied.resolutionPins !== "object") {
      throw new WebLeadConnectorError("checkpoint_context_mismatch", "Web Connector checkpoint 结构无效");
    }
    const restored = structuredClone(supplied); restored.pending = restored.pending.map((target) => this.validateConfiguredTarget(target));
    if (request.cursor && request.cursor !== this.cursor(restored)) throw new WebLeadConnectorError("checkpoint_context_mismatch", "Web Connector cursor 与 checkpoint 不匹配");
    return restored;
  }
  private cloneCheckpoint(checkpoint: WebCheckpoint) { return structuredClone(checkpoint) as unknown as Record<string, unknown>; }
  private cursor(checkpoint: WebCheckpoint) { return `${CHECKPOINT_VERSION}:${checkpoint.processed}:${digest(checkpoint.pending[0]?.url || "done").slice(0, 16)}`; }
  private validateConfiguredTarget(target: WebLeadTarget): WebLeadTarget {
    if (!target || (target.kind !== "search" && target.kind !== "page")) throw new WebLeadConnectorError("invalid_configuration", "Web target kind 无效");
    const validated = this.validateUrl(target.url);
    return { url: validated.url.toString(), kind: target.kind };
  }
  private validateUrl(raw: string): ValidatedUrl {
    let url: URL;
    try { url = new URL(raw); } catch { throw new WebLeadConnectorError("invalid_configuration", "Web target URL 无效"); }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new WebLeadConnectorError("invalid_configuration", "只允许 HTTP/HTTPS URL");
    if (url.username || url.password) throw new WebLeadConnectorError("invalid_configuration", "URL 不得包含账号密码");
    url.hash = ""; url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const policy = this.policies.get(url.hostname);
    if (!policy) throw new WebLeadConnectorError("domain_not_allowed", "URL 不在 allowlist/许可域名中");
    return { url, policy };
  }
  private policyFor(hostname: string) {
    const policy = this.policies.get(hostname.toLowerCase().replace(/\.$/, ""));
    if (!policy) throw new WebLeadConnectorError("domain_not_allowed", "URL 不在 allowlist/许可域名中");
    return policy;
  }
  private async resolveAndPin(url: URL, checkpoint: WebCheckpoint) {
    let resolved: string[];
    try { resolved = [...new Set((await this.resolver(url.hostname)).map((value) => value.trim().toLowerCase()))].sort(); }
    catch (error) { throw new WebLeadConnectorError("dns_rejected", `DNS 解析失败：${error instanceof Error ? error.message : String(error)}`); }
    if (!resolved.length || resolved.some((address) => !isPublicIp(address))) throw new WebLeadConnectorError("dns_rejected", "DNS 返回本机、私网、保留或未分类地址");
    const existing = checkpoint.resolutionPins[url.hostname];
    if (existing && !equalArrays(existing.addresses, resolved)) throw new WebLeadConnectorError("dns_rebinding", "DNS 地址在同一 checkpoint 中发生变化");
    checkpoint.resolutionPins[url.hostname] = { hostname: url.hostname, addresses: resolved };
    return resolved;
  }
  private consume(policy: WebLeadDomainPolicy, url: URL) {
    const nowMs = Date.parse(this.now());
    if (!Number.isFinite(nowMs)) throw new WebLeadConnectorError("invalid_configuration", "now() 返回无效时间");
    const key = `${this.tenantDigest}:${this.id}:${url.origin}`;
    if (!this.rateLimiter.consume(key, policy.maxRequestsPerWindow, policy.windowMs, nowMs)) throw new WebLeadConnectorError("rate_limited", "租户、Connector 与来源域名请求额度已用尽");
  }
  private async request(url: URL, checkpoint: WebCheckpoint, maxBytes: number) {
    const validated = this.validateUrl(url.toString()); const addresses = await this.resolveAndPin(validated.url, checkpoint); this.consume(validated.policy, validated.url);
    try {
      const response = await this.transport.request({ url: validated.url.toString(), method: "GET",
        headers: { accept: "text/html,text/plain;q=0.9", "user-agent": this.userAgent }, timeoutMs: this.timeoutMs,
        maxResponseBytes: maxBytes, resolvedAddresses: addresses });
      if (!response || !Number.isInteger(response.status) || !response.headers || !(response.body instanceof Uint8Array)) throw new WebLeadConnectorError("invalid_response", "Transport 返回格式无效");
      const declared = headerValue(response.headers, "content-length");
      if (declared !== undefined) {
        const length = Number(declared);
        if (!Number.isSafeInteger(length) || length < 0) throw new WebLeadConnectorError("invalid_response", "Content-Length 无效");
        if (length > maxBytes) throw new WebLeadConnectorError("content_too_large", "响应 Content-Length 超过安全上限");
      }
      if (response.body.byteLength > maxBytes) throw new WebLeadConnectorError("content_too_large", "响应实际字节数超过安全上限");
      return response;
    } catch (error) {
      if (error instanceof WebLeadConnectorError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|timed\s*out|abort/i.test(message)) throw new WebLeadConnectorError("timeout", "网页请求超时");
      throw new WebLeadConnectorError("invalid_response", `网页请求失败：${message}`);
    }
  }
  private async getRobots(url: URL, checkpoint: WebCheckpoint): Promise<{ evidence: RobotsEvidence; calls: number }> {
    const cached = checkpoint.robots[url.origin]; if (cached) return { evidence: cached, calls: 0 };
    let current = new URL("/robots.txt", url.origin); let calls = 0;
    for (let redirects = 0; ; redirects += 1) {
      const response = await this.request(current, checkpoint, this.maxResponseBytes); calls += 1;
      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects >= this.maxRedirects) throw new WebLeadConnectorError("robots_unavailable", "robots 重定向次数过多");
        const location = headerValue(response.headers, "location");
        if (!location) throw new WebLeadConnectorError("robots_unavailable", "robots 重定向缺少 Location");
        const next = new URL(location, current);
        if (next.origin !== url.origin) throw new WebLeadConnectorError("robots_unavailable", "robots 不允许跨来源重定向");
        current = this.validateUrl(next.toString()).url; continue;
      }
      if (response.status !== 200) throw new WebLeadConnectorError("robots_unavailable", `robots 返回状态 ${response.status}`);
      const contentType = normalizedContentType(response.headers);
      if (!ROBOTS_CONTENT_TYPES.has(contentType)) throw new WebLeadConnectorError("robots_unavailable", "robots Content-Type 不是 text/plain");
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(response.body);
      const evidence: RobotsEvidence = { url: current.toString(), digest: digest(response.body), rules: parseRobots(raw, this.userAgent), fetchedAt: this.now() };
      checkpoint.robots[url.origin] = evidence; return { evidence, calls };
    }
  }

  private async fetchTarget(target: WebLeadTarget, checkpoint: WebCheckpoint): Promise<FetchedContent> {
    let current = this.validateUrl(target.url).url; let calls = 0;
    const initialRobots = await this.getRobots(current, checkpoint); calls += initialRobots.calls;
    const initialDecision = robotsDecision(initialRobots.evidence.rules, current);
    if (!initialDecision.allowed) throw new WebLeadConnectorError("robots_disallowed", `robots 禁止访问：${initialDecision.matchedRule}`);
    for (let redirects = 0; ; redirects += 1) {
      const originRobots = await this.getRobots(current, checkpoint); calls += originRobots.calls;
      const decision = robotsDecision(originRobots.evidence.rules, current);
      if (!decision.allowed) throw new WebLeadConnectorError("robots_disallowed", `robots 禁止访问：${decision.matchedRule}`);
      const response = await this.request(current, checkpoint, this.maxResponseBytes); calls += 1;
      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects >= this.maxRedirects) throw new WebLeadConnectorError("too_many_redirects", "网页重定向次数超过安全上限");
        const location = headerValue(response.headers, "location");
        if (!location) throw new WebLeadConnectorError("invalid_response", "网页重定向缺少 Location");
        current = this.validateUrl(new URL(location, current).toString()).url;
        await this.resolveAndPin(current, checkpoint); continue;
      }
      if (response.status < 200 || response.status >= 300) throw new WebLeadConnectorError("invalid_response", `网页返回状态 ${response.status}`);
      const contentType = normalizedContentType(response.headers);
      if (!BODY_CONTENT_TYPES.has(contentType)) throw new WebLeadConnectorError("content_type_rejected", `网页 Content-Type 不允许：${contentType || "missing"}`);
      return { url: current.toString(), contentType, body: response.body, calls };
    }
  }

  private toRawRecord(record: WebLeadExtractedRecord, index: number, context: {
    target: WebLeadTarget; fetched: FetchedContent; fetchedAt: string; policy: WebLeadDomainPolicy;
    robots: RobotsEvidence; decision: { allowed: boolean; matchedRule: string }; contentDigest: string; promptInjectionSignals: string[];
  }): RawLeadIngestionRecord {
    if (!record || !record.fields) throw new WebLeadConnectorError("content_rejected", "Extractor record 缺少 fields");
    const fields: RawLeadIngestionFields = {
      company: cleanField(record.fields.company), website: cleanField(record.fields.website), country: cleanField(record.fields.country),
      contact: cleanField(record.fields.contact), email: cleanField(record.fields.email), phone: cleanField(record.fields.phone),
      business: cleanField(record.fields.business), description: cleanField(record.fields.description)
    };
    if (!fields.company) throw new WebLeadConnectorError("content_rejected", "Extractor record 缺少公司名称");
    const webLineage = {
      connectorId: this.id, targetKind: context.target.kind, finalUrl: context.fetched.url, contentType: context.fetched.contentType,
      contentDigest: context.contentDigest, fetchedAt: context.fetchedAt, permissionBasis: context.policy.permission.basis,
      permissionReference: context.policy.permission.reference, permissionReviewedAt: context.policy.permission.reviewedAt,
      robotsUrl: context.robots.url, robotsDigest: context.robots.digest, robotsDecision: context.decision.allowed ? "allowed" : "disallowed",
      robotsMatchedRule: context.decision.matchedRule, trust: "untrusted_external", instructionUse: "forbidden",
      promptInjectionSignals: [...context.promptInjectionSignals]
    };
    return {
      externalId: cleanField(record.externalId) || `${context.contentDigest}:${index}`,
      sourceUrl: context.fetched.url,
      occurredAt: record.occurredAt ? cleanField(record.occurredAt) : context.fetchedAt,
      fields,
      payload: { webLineage }
    };
  }
}