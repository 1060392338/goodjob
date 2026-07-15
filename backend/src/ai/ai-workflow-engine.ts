import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  type BaseCheckpointSaver
} from "@langchain/langgraph";
import { z } from "zod";
import type { ModelGateway } from "../gateways/model-gateway.js";
import type { AiModelConfig } from "../types.js";

export type AiWorkflowStatus = "running" | "awaiting_confirmation" | "completed" | "rejected";
export type AiWorkflowDecision = "approve" | "reject" | "rerun";
export type AiWorkflowAction = "lead:read" | "lead:ai-score:apply";

export interface AiWorkflowActor {
  id: string;
  tenantId: string;
}

export interface AiWorkflowLead {
  id: string;
  ownerId: string;
  company: string;
  country?: string;
  summary?: string;
}

export const aiWorkflowProposalSchema = z.object({
  score: z.number().int().min(0).max(100),
  grade: z.enum(["A", "B", "C"]),
  rationale: z.string().trim().min(1).max(500),
  nextAction: z.string().trim().min(1).max(300)
}).strict();

export type AiWorkflowProposal = z.infer<typeof aiWorkflowProposalSchema>;

export type AiWorkflowAuditEventType =
  | "workflow.started"
  | "permission.checked"
  | "lead.read"
  | "model.called"
  | "proposal.validated"
  | "workflow.paused"
  | "approval.received"
  | "permission.rechecked"
  | "effect.completed"
  | "workflow.completed"
  | "workflow.rejected"
  | "workflow.rerun"
  | "workflow.failed";

export interface AiWorkflowAuditEvent {
  type: AiWorkflowAuditEventType;
  runId: string;
  traceId: string;
  step: string;
  actorId: string;
  tenantId: string;
  leadId: string;
  occurredAt: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface AiWorkflowSnapshot {
  runId: string;
  workflowTraceId: string;
  actorId: string;
  tenantId: string;
  leadId: string;
  modelConfigId: string;
  status: AiWorkflowStatus;
  attempt: number;
  proposal: AiWorkflowProposal | null;
  outcome: "accepted" | "rejected" | null;
  effectReferenceId: string | null;
}

export interface AiWorkflowEffectResult<T> {
  executed: boolean;
  value: T;
}

export interface AiWorkflowEffectStore {
  executeOnce<T>(idempotencyKey: string, operation: () => Promise<T>): Promise<AiWorkflowEffectResult<T>>;
}

export interface AiWorkflowPersistence {
  createRun(snapshot: AiWorkflowSnapshot): Promise<{ created: boolean; snapshot?: AiWorkflowSnapshot }>;
  saveSnapshot(snapshot: AiWorkflowSnapshot): Promise<void>;
  getRun(runId: string): Promise<AiWorkflowSnapshot | null>;
  claimDecision(input: {
    runId: string;
    attempt: number;
    decision: AiWorkflowDecision;
    actorId: string;
    tenantId: string;
  }): Promise<{ claimed: boolean; decision: AiWorkflowDecision }>;
  appendAudit(event: AiWorkflowAuditEvent): Promise<void>;
}

export interface AiWorkflowEngineOptions {
  modelGateway: ModelGateway;
  resolveModelConfig(input: { configId: string; actorId: string; tenantId: string }): Promise<AiModelConfig | null>;
  authorize(input: {
    actorId: string;
    tenantId: string;
    action: AiWorkflowAction;
    leadId: string;
  }): Promise<boolean>;
  readLead(input: { actorId: string; tenantId: string; leadId: string }): Promise<AiWorkflowLead>;
  applyProposal(input: {
    actorId: string;
    tenantId: string;
    lead: AiWorkflowLead;
    proposal: AiWorkflowProposal;
    idempotencyKey: string;
    traceId: string;
  }): Promise<{ referenceId: string }>;
  audit(event: AiWorkflowAuditEvent): Promise<void>;
  checkpointer?: BaseCheckpointSaver;
  effectStore?: AiWorkflowEffectStore;
  persistence?: AiWorkflowPersistence;
  createRunId?: () => string;
  createTraceId?: () => string;
  now?: () => Date;
}

export interface AiWorkflowEngine {
  start(input: { actor: AiWorkflowActor; leadId: string; modelConfigId: string; runId?: string }): Promise<AiWorkflowSnapshot>;
  resume(input: { runId: string; actor: AiWorkflowActor; decision: AiWorkflowDecision }): Promise<AiWorkflowSnapshot>;
  getSnapshot(runId: string): Promise<AiWorkflowSnapshot | null>;
}

export type AiWorkflowErrorCode =
  | "not_found"
  | "forbidden"
  | "resume_forbidden"
  | "decision_conflict"
  | "model_config_unavailable"
  | "invalid_model_output";

export class AiWorkflowError extends Error {
  constructor(public readonly code: AiWorkflowErrorCode, message: string) {
    super(message);
    this.name = "AiWorkflowError";
  }
}

type WorkflowStateValue = {
  runId: string;
  workflowTraceId: string;
  actor: AiWorkflowActor;
  leadId: string;
  modelConfigId: string;
  status: AiWorkflowStatus;
  attempt: number;
  lead: AiWorkflowLead | null;
  proposal: AiWorkflowProposal | null;
  decision: AiWorkflowDecision | null;
  outcome: "accepted" | "rejected" | null;
  effectReferenceId: string | null;
};

const WorkflowState = Annotation.Root({
  runId: Annotation<string>(),
  workflowTraceId: Annotation<string>(),
  actor: Annotation<AiWorkflowActor>(),
  leadId: Annotation<string>(),
  modelConfigId: Annotation<string>(),
  status: Annotation<AiWorkflowStatus>(),
  attempt: Annotation<number>(),
  lead: Annotation<AiWorkflowLead | null>(),
  proposal: Annotation<AiWorkflowProposal | null>(),
  decision: Annotation<AiWorkflowDecision | null>(),
  outcome: Annotation<"accepted" | "rejected" | null>(),
  effectReferenceId: Annotation<string | null>()
});

function defaultId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeSnapshot(state: WorkflowStateValue): AiWorkflowSnapshot {
  return {
    runId: state.runId,
    workflowTraceId: state.workflowTraceId,
    actorId: state.actor.id,
    tenantId: state.actor.tenantId,
    leadId: state.leadId,
    modelConfigId: state.modelConfigId,
    status: state.status,
    attempt: state.attempt,
    proposal: state.proposal,
    outcome: state.outcome,
    effectReferenceId: state.effectReferenceId
  };
}

function proposalPrompt(lead: AiWorkflowLead) {
  return JSON.stringify({
    instruction: "Score this foreign-trade lead. Return strict JSON only.",
    schema: {
      score: "integer 0-100",
      grade: "A | B | C",
      rationale: "1-500 characters",
      nextAction: "1-300 characters"
    },
    lead: {
      id: lead.id,
      company: lead.company,
      country: lead.country || "",
      summary: lead.summary || ""
    }
  });
}

export function createAiWorkflowCheckpointer() {
  return new MemorySaver();
}

export function createInMemoryWorkflowEffectStore(): AiWorkflowEffectStore {
  const effects = new Map<string, Promise<unknown>>();
  return {
    async executeOnce<T>(idempotencyKey: string, operation: () => Promise<T>) {
      let executed = false;
      let pending = effects.get(idempotencyKey) as Promise<T> | undefined;
      if (!pending) {
        executed = true;
        pending = operation();
        effects.set(idempotencyKey, pending);
        pending.catch(() => {
          if (effects.get(idempotencyKey) === pending) effects.delete(idempotencyKey);
        });
      }
      return { executed, value: await pending };
    }
  };
}

export function createAiWorkflowEngine(options: AiWorkflowEngineOptions): AiWorkflowEngine {
  const checkpointer = options.checkpointer || createAiWorkflowCheckpointer();
  const effectStore = options.effectStore || createInMemoryWorkflowEffectStore();
  const createRunId = options.createRunId || (() => defaultId("ai-workflow"));
  const createTraceId = options.createTraceId || (() => defaultId("trace"));
  const now = options.now || (() => new Date());

  async function audit(
    state: WorkflowStateValue,
    type: AiWorkflowAuditEventType,
    step: string,
    details?: AiWorkflowAuditEvent["details"],
    traceId = createTraceId()
  ) {
    const event: AiWorkflowAuditEvent = {
      type,
      runId: state.runId,
      traceId,
      step,
      actorId: state.actor.id,
      tenantId: state.actor.tenantId,
      leadId: state.leadId,
      occurredAt: now().toISOString(),
      details
    };
    await options.persistence?.appendAudit(event);
    await options.audit(event);
  }

  async function fail(state: WorkflowStateValue, step: string, code: AiWorkflowErrorCode, message: string): Promise<never> {
    await audit(state, "workflow.failed", step, { code });
    throw new AiWorkflowError(code, message);
  }

  const graph = new StateGraph(WorkflowState)
    .addNode("authorize_read", async (state) => {
      const allowed = await options.authorize({
        actorId: state.actor.id,
        tenantId: state.actor.tenantId,
        action: "lead:read",
        leadId: state.leadId
      });
      await audit(state, "permission.checked", "authorize_read", { action: "lead:read", allowed });
      if (!allowed) return fail(state, "authorize_read", "forbidden", "Lead read is not permitted");
      return { status: "running" as const };
    })
    .addNode("read_lead", async (state) => {
      const lead = await options.readLead({
        actorId: state.actor.id,
        tenantId: state.actor.tenantId,
        leadId: state.leadId
      });
      await audit(state, "lead.read", "read_lead", { ownerMatchesActor: lead.ownerId === state.actor.id });
      return { lead };
    })
    .addNode("score_lead", async (state) => {
      if (!state.lead) return fail(state, "score_lead", "not_found", "Lead state is unavailable");
      const config = await options.resolveModelConfig({
        configId: state.modelConfigId,
        actorId: state.actor.id,
        tenantId: state.actor.tenantId
      });
      if (!config || !config.enabled || !config.useScoring) {
        return fail(state, "score_lead", "model_config_unavailable", "Scoring model configuration is unavailable");
      }
      const modelResult = await options.modelGateway.generateText({
        config,
        systemPrompt: "You are a lead scoring service. Return strict JSON only.",
        prompt: proposalPrompt(state.lead),
        maxInputChars: 12_000
      });
      await audit(state, "model.called", "score_lead", {
        provider: modelResult.provider,
        model: modelResult.model,
        attempt: state.attempt + 1
      }, modelResult.traceId);

      let raw: unknown;
      try {
        raw = JSON.parse(modelResult.content);
      } catch {
        return fail(state, "score_lead", "invalid_model_output", "Model output is not valid JSON");
      }
      const parsed = aiWorkflowProposalSchema.safeParse(raw);
      if (!parsed.success) {
        return fail(state, "score_lead", "invalid_model_output", "Model output does not match the scoring schema");
      }
      await audit(state, "proposal.validated", "score_lead", {
        score: parsed.data.score,
        grade: parsed.data.grade,
        attempt: state.attempt + 1
      });
      return {
        proposal: parsed.data,
        attempt: state.attempt + 1,
        decision: null,
        status: "running" as const
      };
    })
    .addNode("mark_awaiting_confirmation", async (state) => {
      await audit(state, "workflow.paused", "mark_awaiting_confirmation", { attempt: state.attempt });
      return { status: "awaiting_confirmation" as const };
    })
    .addNode("human_decision", async (state) => {
      const decision = interrupt<{
        runId: string;
        proposal: AiWorkflowProposal | null;
        allowedDecisions: AiWorkflowDecision[];
      }, AiWorkflowDecision>({
        runId: state.runId,
        proposal: state.proposal,
        allowedDecisions: ["approve", "reject", "rerun"]
      });
      if (!(["approve", "reject", "rerun"] as string[]).includes(decision)) {
        return fail(state, "human_decision", "resume_forbidden", "Unsupported workflow decision");
      }
      await audit(state, "approval.received", "human_decision", { decision, attempt: state.attempt });
      return { decision };
    })
    .addNode("record_rerun", async (state) => {
      await audit(state, "workflow.rerun", "record_rerun", { nextAttempt: state.attempt + 1 });
      return { status: "running" as const, proposal: null, decision: null };
    })
    .addNode("record_rejection", async (state) => {
      await audit(state, "workflow.rejected", "record_rejection", { attempt: state.attempt });
      return { status: "rejected" as const, outcome: "rejected" as const };
    })
    .addNode("apply_proposal", async (state) => {
      if (!state.lead || !state.proposal) {
        return fail(state, "apply_proposal", "not_found", "Lead or proposal state is unavailable");
      }
      const allowed = await options.authorize({
        actorId: state.actor.id,
        tenantId: state.actor.tenantId,
        action: "lead:ai-score:apply",
        leadId: state.leadId
      });
      await audit(state, "permission.rechecked", "apply_proposal", {
        action: "lead:ai-score:apply",
        allowed
      });
      if (!allowed) return fail(state, "apply_proposal", "forbidden", "Lead score write is not permitted");

      const idempotencyKey = `ai-workflow:${state.runId}:apply`;
      const effectTraceId = createTraceId();
      const effect = await effectStore.executeOnce(idempotencyKey, () => options.applyProposal({
        actorId: state.actor.id,
        tenantId: state.actor.tenantId,
        lead: state.lead!,
        proposal: state.proposal!,
        idempotencyKey,
        traceId: effectTraceId
      }));
      await audit(state, "effect.completed", "apply_proposal", {
        idempotencyKey,
        executed: effect.executed,
        referenceId: effect.value.referenceId
      }, effectTraceId);
      await audit(state, "workflow.completed", "apply_proposal", {
        outcome: "accepted",
        referenceId: effect.value.referenceId
      });
      return {
        status: "completed" as const,
        outcome: "accepted" as const,
        effectReferenceId: effect.value.referenceId
      };
    })
    .addEdge(START, "authorize_read")
    .addEdge("authorize_read", "read_lead")
    .addEdge("read_lead", "score_lead")
    .addEdge("score_lead", "mark_awaiting_confirmation")
    .addEdge("mark_awaiting_confirmation", "human_decision")
    .addConditionalEdges("human_decision", (state) => state.decision || "reject", {
      approve: "apply_proposal",
      reject: "record_rejection",
      rerun: "record_rerun"
    })
    .addEdge("record_rerun", "score_lead")
    .addEdge("record_rejection", END)
    .addEdge("apply_proposal", END)
    .compile({ checkpointer });

  const configFor = (runId: string) => ({ configurable: { thread_id: runId } });

  async function getGraphSnapshot(runId: string): Promise<AiWorkflowSnapshot | null> {
    try {
      const snapshot = await graph.getState(configFor(runId));
      const state = snapshot.values as Partial<WorkflowStateValue>;
      if (!state.runId || !state.actor || !state.status) return null;
      return safeSnapshot(state as WorkflowStateValue);
    } catch {
      return null;
    }
  }

  async function getSnapshot(runId: string): Promise<AiWorkflowSnapshot | null> {
    return await getGraphSnapshot(runId) ?? await options.persistence?.getRun(runId) ?? null;
  }

  async function persistSnapshot(state: WorkflowStateValue) {
    const snapshot = safeSnapshot(state);
    await options.persistence?.saveSnapshot(snapshot);
    return snapshot;
  }

  return {
    async start(input) {
      const runId = input.runId || createRunId();
      const initialState: WorkflowStateValue = {
        runId,
        workflowTraceId: createTraceId(),
        actor: input.actor,
        leadId: input.leadId,
        modelConfigId: input.modelConfigId,
        status: "running",
        attempt: 0,
        lead: null,
        proposal: null,
        decision: null,
        outcome: null,
        effectReferenceId: null
      };
      if (options.persistence) {
        const created = await options.persistence.createRun(safeSnapshot(initialState));
        if (!created.created) {
          const existing = await getGraphSnapshot(runId) ?? created.snapshot ?? await options.persistence.getRun(runId);
          if (!existing) throw new AiWorkflowError("not_found", "Workflow run could not be recovered");
          if (existing.actorId !== input.actor.id || existing.tenantId !== input.actor.tenantId) {
            throw new AiWorkflowError("resume_forbidden", "Workflow run belongs to another actor or tenant");
          }
          if (existing.leadId !== input.leadId || existing.modelConfigId !== input.modelConfigId) {
            throw new AiWorkflowError("resume_forbidden", "Workflow run identity does not match the original request");
          }
          if (existing.status !== "running" || await getGraphSnapshot(runId)) return existing;
          initialState.workflowTraceId = existing.workflowTraceId;
        }
      }
      await audit(initialState, "workflow.started", "start", { modelConfigId: input.modelConfigId });
      const result = await graph.invoke(initialState, configFor(runId));
      return persistSnapshot(result as WorkflowStateValue);
    },

    async resume(input) {
      const current = await getSnapshot(input.runId);
      if (!current) throw new AiWorkflowError("not_found", "Workflow run was not found");
      if (current.actorId !== input.actor.id || current.tenantId !== input.actor.tenantId) {
        throw new AiWorkflowError("resume_forbidden", "Workflow run belongs to another actor or tenant");
      }
      if (current.status !== "awaiting_confirmation" && current.status !== "completed" && current.status !== "rejected") {
        throw new AiWorkflowError("resume_forbidden", "Workflow run is not waiting for confirmation");
      }
      if (options.persistence) {
        const claim = await options.persistence.claimDecision({
          runId: input.runId,
          attempt: current.attempt,
          decision: input.decision,
          actorId: input.actor.id,
          tenantId: input.actor.tenantId
        });
        if (claim.decision !== input.decision) {
          throw new AiWorkflowError("decision_conflict", "A different workflow decision was already recorded");
        }
      }
      if (current.status === "completed" || current.status === "rejected") return current;
      const result = await graph.invoke(new Command({ resume: input.decision }), configFor(input.runId));
      return persistSnapshot(result as WorkflowStateValue);
    },

    getSnapshot
  };
}
