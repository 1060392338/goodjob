import assert from "node:assert/strict";
import type { AiModelConfig } from "../types.js";
import type { ModelGateway, ModelGatewayRequest } from "../gateways/model-gateway.js";
import {
  AiWorkflowError,
  createAiWorkflowCheckpointer,
  createAiWorkflowEngine,
  createInMemoryWorkflowEffectStore,
  type AiWorkflowAuditEvent
} from "./ai-workflow-engine.js";

const secretApiKey = "workflow-secret-must-not-enter-checkpoint";
const modelConfig: AiModelConfig = {
  id: "cfg-score",
  provider: "mock-provider",
  protocol: "openai-compatible",
  name: "Mock score model",
  baseUrl: "https://models.example.test/v1",
  model: "mock-score-1",
  apiKey: secretApiKey,
  enabled: true,
  temperature: 0,
  useLeadFinder: false,
  useWebsiteParse: false,
  useScoring: true,
  useEmailDraft: false,
  useExam: false,
  ownerId: "user-1",
  teamId: "team-1",
  updatedAt: "2026-07-15T00:00:00.000Z"
};

class QueueModelGateway implements ModelGateway {
  calls: ModelGatewayRequest[] = [];
  realOutboundCalls = 0;

  constructor(private readonly responses: string[]) {}

  async generateText(request: ModelGatewayRequest) {
    this.calls.push(request);
    const content = this.responses.shift();
    if (content === undefined) throw new Error("missing mock response");
    return {
      content,
      traceId: `model-trace-${this.calls.length}`,
      provider: request.config.provider,
      model: request.config.model,
      usage: { total_tokens: 12 }
    };
  }
}

function proposal(score: number, suffix = "") {
  return JSON.stringify({
    score,
    grade: score >= 80 ? "A" : score >= 60 ? "B" : "C",
    rationale: `Mock rationale ${suffix}`.trim(),
    nextAction: `Mock next action ${suffix}`.trim()
  });
}

async function expectWorkflowError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    assert.fail(`expected AiWorkflowError(${code})`);
  } catch (error) {
    assert.ok(error instanceof AiWorkflowError);
    assert.equal(error.code, code);
  }
}

const checkpointer = createAiWorkflowCheckpointer();
const effectStore = createInMemoryWorkflowEffectStore();
const gateway = new QueueModelGateway([
  proposal(82, "approve"),
  proposal(45, "reject"),
  proposal(35, "rerun-1"),
  proposal(91, "rerun-2"),
  proposal(73, "permission"),
  "not-json",
  proposal(67, "different-actor"),
  proposal(86, "concurrent-approval")
]);
const auditEvents: AiWorkflowAuditEvent[] = [];
const writes: Array<{ key: string; score: number; actorId: string }> = [];
let allowRead = true;
let allowApply = true;
let runSequence = 0;
let traceSequence = 0;

const dependencies = {
  modelGateway: gateway,
  checkpointer,
  effectStore,
  resolveModelConfig: async ({ configId, actorId }: { configId: string; actorId: string }) => {
    assert.equal(configId, modelConfig.id);
    assert.equal(actorId, "user-1");
    return modelConfig;
  },
  authorize: async ({ action }: { action: string }) => action === "lead:read" ? allowRead : allowApply,
  readLead: async ({ leadId, actorId }: { leadId: string; actorId: string }) => ({
    id: leadId,
    ownerId: actorId,
    company: "Example Lighting GmbH",
    country: "Germany",
    summary: "Public mock lead summary"
  }),
  applyProposal: async ({ idempotencyKey, proposal: accepted, actorId }: {
    idempotencyKey: string;
    proposal: { score: number };
    actorId: string;
  }) => {
    writes.push({ key: idempotencyKey, score: accepted.score, actorId });
    return { referenceId: `lead-score-${writes.length}` };
  },
  audit: async (event: AiWorkflowAuditEvent) => { auditEvents.push(event); },
  createRunId: () => `workflow-run-${++runSequence}`,
  createTraceId: () => `workflow-trace-${++traceSequence}`
};

const actor = { id: "user-1", tenantId: "team-1" };
const engine = createAiWorkflowEngine(dependencies);

// Start must pause before every write. The API key is resolved at runtime and must not enter public state.
const awaiting = await engine.start({ actor, leadId: "lead-approve", modelConfigId: modelConfig.id });
assert.equal(awaiting.status, "awaiting_confirmation");
assert.equal(awaiting.attempt, 1);
assert.equal(awaiting.proposal?.score, 82);
assert.equal(writes.length, 0);
assert.equal(gateway.calls.length, 1);
assert.equal(JSON.stringify(awaiting).includes(secretApiKey), false);

// A new engine instance must resume the interrupted graph from the shared checkpointer.
const resumedEngine = createAiWorkflowEngine(dependencies);
const approved = await resumedEngine.resume({ runId: awaiting.runId, actor, decision: "approve" });
assert.equal(approved.status, "completed");
assert.equal(approved.outcome, "accepted");
assert.equal(writes.length, 1);
assert.equal(writes[0]?.score, 82);
assert.equal(writes[0]?.key, `ai-workflow:${awaiting.runId}:apply`);

// Replaying the same approval is a no-op and cannot duplicate the domain write.
const duplicate = await resumedEngine.resume({ runId: awaiting.runId, actor, decision: "approve" });
assert.equal(duplicate.status, "completed");
assert.equal(writes.length, 1);

// Reject must terminate without a write.
const rejectRun = await engine.start({ actor, leadId: "lead-reject", modelConfigId: modelConfig.id });
const rejected = await engine.resume({ runId: rejectRun.runId, actor, decision: "reject" });
assert.equal(rejected.status, "rejected");
assert.equal(rejected.outcome, "rejected");
assert.equal(writes.length, 1);

// Rerun must call ModelGateway again, replace the proposal, and pause for a new confirmation.
const rerunStart = await engine.start({ actor, leadId: "lead-rerun", modelConfigId: modelConfig.id });
assert.equal(rerunStart.proposal?.score, 35);
const rerunAwaiting = await engine.resume({ runId: rerunStart.runId, actor, decision: "rerun" });
assert.equal(rerunAwaiting.status, "awaiting_confirmation");
assert.equal(rerunAwaiting.attempt, 2);
assert.equal(rerunAwaiting.proposal?.score, 91);
assert.equal(writes.length, 1);
const rerunApproved = await engine.resume({ runId: rerunStart.runId, actor, decision: "approve" });
assert.equal(rerunApproved.status, "completed");
assert.equal(writes.length, 2);
assert.equal(writes[1]?.score, 91);

// Permission is rechecked after approval. A revoked permission must block the tool call.
const permissionRun = await engine.start({ actor, leadId: "lead-permission", modelConfigId: modelConfig.id });
allowApply = false;
await expectWorkflowError(engine.resume({ runId: permissionRun.runId, actor, decision: "approve" }), "forbidden");
assert.equal(writes.length, 2);
allowApply = true;

// Invalid structured output must fail before confirmation or write.
await expectWorkflowError(engine.start({ actor, leadId: "lead-invalid", modelConfigId: modelConfig.id }), "invalid_model_output");
assert.equal(writes.length, 2);

// A different actor cannot resume another user's workflow.
const actorRun = await engine.start({ actor, leadId: "lead-actor", modelConfigId: modelConfig.id });
await expectWorkflowError(engine.resume({
  runId: actorRun.runId,
  actor: { id: "user-2", tenantId: "team-1" },
  decision: "approve"
}), "resume_forbidden");
assert.equal(writes.length, 2);

// Concurrent duplicate confirmations share the same stable effect key and write at most once.
const concurrentRun = await engine.start({ actor, leadId: "lead-concurrent", modelConfigId: modelConfig.id });
const writesBeforeConcurrentApproval = writes.length;
const concurrentApprovals = await Promise.allSettled([
  engine.resume({ runId: concurrentRun.runId, actor, decision: "approve" }),
  engine.resume({ runId: concurrentRun.runId, actor, decision: "approve" })
]);
assert.ok(concurrentApprovals.some((result) => result.status === "fulfilled"));
assert.equal(writes.length, writesBeforeConcurrentApproval + 1);
assert.equal(writes.at(-1)?.key, `ai-workflow:${concurrentRun.runId}:apply`);
assert.equal((await engine.getSnapshot(concurrentRun.runId))?.status, "completed");

// Read authorization is checked before the lead reader or model gateway can be used.
const modelCallsBeforeDeniedRead = gateway.calls.length;
allowRead = false;
await expectWorkflowError(engine.start({ actor, leadId: "lead-read-denied", modelConfigId: modelConfig.id }), "forbidden");
assert.equal(gateway.calls.length, modelCallsBeforeDeniedRead);
assert.equal(writes.length, 3);
allowRead = true;

// Checkpoint inspection must prove the model API key was never persisted.
let serializedCheckpoints = "";
for await (const tuple of checkpointer.list({ configurable: { thread_id: awaiting.runId } })) {
  serializedCheckpoints += JSON.stringify(tuple);
}
assert.equal(serializedCheckpoints.includes(secretApiKey), false);
assert.ok(serializedCheckpoints.includes(awaiting.runId));

// Auditing must cover workflow, model, approval, permission and effect steps with trace IDs.
const eventTypes = new Set(auditEvents.map((event) => event.type));
const requiredEventTypes: AiWorkflowAuditEvent["type"][] = [
  "workflow.started",
  "permission.checked",
  "lead.read",
  "model.called",
  "proposal.validated",
  "workflow.paused",
  "approval.received",
  "permission.rechecked",
  "effect.completed",
  "workflow.completed",
  "workflow.rejected",
  "workflow.rerun",
  "workflow.failed"
];
for (const required of requiredEventTypes) assert.ok(eventTypes.has(required), `missing audit event ${required}`);
assert.ok(auditEvents.every((event) => event.traceId && event.runId && event.step));
assert.equal(JSON.stringify(auditEvents).includes(secretApiKey), false);
assert.equal(gateway.realOutboundCalls, 0);

console.log(JSON.stringify({
  ok: true,
  workflowRuns: runSequence,
  modelCalls: gateway.calls.length,
  writes: writes.length,
  realOutboundCalls: gateway.realOutboundCalls,
  pauseResume: true,
  duplicateApprovalWrites: 0,
  rejectedWrites: 0,
  unauthorizedWrites: 0,
  secretInCheckpoint: false,
  auditedEventTypes: [...eventTypes].sort()
}, null, 2));
