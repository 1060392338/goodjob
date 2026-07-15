export interface LeadProviderStatus {
  id: string;
  name: string;
  tier: "free" | "byok_free" | "paid" | "ai";
  category: "web" | "company" | "email" | "ai";
  requiresKey: boolean;
  capabilities: string[];
  docsUrl: string;
  keyHint: string;
  defaultBaseUrl: string;
  costNote: string;
  hasApiKey: boolean;
  ready: boolean;
  enabled: boolean;
  lastTestStatus: "untested" | "passed" | "failed";
  lastTestMessage: string;
  lastTestAt: string;
  usage: string;
}

export interface LeadSourceCenterState {
  leadProviders: LeadProviderStatus[];
  selectedLeadSources: string[];
  leadSourceSelectionTouched: boolean;
}

export interface LeadProviderListResponse {
  providers: LeadProviderStatus[];
}

export interface LeadProviderTestResponse extends LeadProviderListResponse {
  ok: boolean;
  message: string;
  usage: string;
}

export type LeadSourceApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export function defaultSelectedLeadSourceIds(providers: LeadProviderStatus[]) {
  return providers
    .filter((provider) => provider.ready && provider.enabled && provider.id !== "ai_search")
    .map((provider) => provider.id);
}

export function refreshLeadSourceProviders(
  state: LeadSourceCenterState,
  providers: LeadProviderStatus[]
): LeadSourceCenterState {
  return {
    leadProviders: providers,
    selectedLeadSources: state.leadSourceSelectionTouched
      ? [...state.selectedLeadSources]
      : defaultSelectedLeadSourceIds(providers),
    leadSourceSelectionTouched: state.leadSourceSelectionTouched
  };
}

export function toggleLeadSourceSelection(
  state: LeadSourceCenterState,
  providerId: string
): LeadSourceCenterState {
  const selected = state.selectedLeadSources.includes(providerId)
    ? state.selectedLeadSources.filter((id) => id !== providerId)
    : [...state.selectedLeadSources, providerId];
  return {
    leadProviders: state.leadProviders,
    selectedLeadSources: selected,
    leadSourceSelectionTouched: true
  };
}

export function markLeadSourceSelected(
  state: LeadSourceCenterState,
  providerId: string
): LeadSourceCenterState {
  return {
    leadProviders: state.leadProviders,
    selectedLeadSources: state.selectedLeadSources.includes(providerId)
      ? [...state.selectedLeadSources]
      : [...state.selectedLeadSources, providerId],
    leadSourceSelectionTouched: true
  };
}

export function removeLeadSourceSelection(
  state: LeadSourceCenterState,
  providerId: string
): LeadSourceCenterState {
  return {
    leadProviders: state.leadProviders,
    selectedLeadSources: state.selectedLeadSources.filter((id) => id !== providerId),
    leadSourceSelectionTouched: state.leadSourceSelectionTouched
  };
}

export function createLeadSourceCenterClient(request: LeadSourceApiRequest) {
  return {
    loadProviders() {
      return request<LeadProviderListResponse>("/api/lead-finder/providers");
    },
    saveConfig(provider: string, apiKey: string) {
      return request<LeadProviderListResponse>("/api/lead-finder/source-config", {
        method: "POST",
        body: JSON.stringify({ provider, apiKey, enabled: true })
      });
    },
    testConfig(provider: string) {
      return request<LeadProviderTestResponse>("/api/lead-finder/source-config/test", {
        method: "POST",
        body: JSON.stringify({ provider })
      });
    },
    deleteConfig(provider: string) {
      return request<LeadProviderListResponse>(
        `/api/lead-finder/source-config/${encodeURIComponent(provider)}`,
        { method: "DELETE" }
      );
    }
  };
}
