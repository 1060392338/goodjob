import type { SessionUser } from "../../types.js";
import { persistLeadFromSource, type LeadIntake } from "./lead-service.js";
import {
  LeadIngestionPipelineError,
  type LeadIngestionContext,
  type LeadIngestionSink,
  type NormalizedLeadIngestionRecord
} from "./lead-ingestion-pipeline.js";

export interface CrmLeadIngestionSinkOptions {
  user: SessionUser;
  persistLead?: (
    user: SessionUser,
    input: LeadIntake
  ) => Promise<{ lead: { id: string }; duplicate: boolean }>;
}

function intakeFromRecord(record: NormalizedLeadIngestionRecord, context: LeadIngestionContext): LeadIntake {
  return {
    company: record.company,
    contact: record.contact,
    country: record.country,
    email: record.email,
    phone: record.phone,
    wechat: "",
    source: record.evidence.provider,
    intent: "低",
    stage: "待联系",
    estimatedAmount: 0,
    nextFollowAt: "",
    remark: [record.business, record.description].filter(Boolean).join("；"),
    sourceType: context.sourceType,
    sourceChannel: context.sourceChannel,
    sourceCampaign: context.sourceCampaign,
    externalId: record.recordKey,
    sourceUrl: record.sourceUrl || record.website,
    occurredAt: record.occurredAt,
    rawPayload: {
      recordKey: record.recordKey,
      evidence: record.evidence,
      normalized: {
        company: record.company,
        website: record.website,
        country: record.country,
        contact: record.contact,
        email: record.email,
        phone: record.phone,
        business: record.business,
        description: record.description
      }
    }
  };
}

export function createCrmLeadIngestionSink(options: CrmLeadIngestionSinkOptions): LeadIngestionSink {
  const persistLead = options.persistLead || persistLeadFromSource;
  return {
    async ingest(record, context) {
      if (context.ownerId !== options.user.id || context.teamId !== options.user.teamId) {
        throw new LeadIngestionPipelineError(
          "checkpoint_context_mismatch",
          "Lead ingestion sink user does not match the job context"
        );
      }
      const result = await persistLead(options.user, intakeFromRecord(record, context));
      return {
        status: result.duplicate ? "duplicate" : "created",
        leadId: result.lead.id
      };
    }
  };
}
