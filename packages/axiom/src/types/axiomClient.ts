import type { AxiomWithoutBatching } from "@axiomhq/js";

export type AxiomClientConfig = {
	/** API token, or a personal token together with `orgId`. */
	token: string;
	orgId?: string;
};

/** The official SDK client, query-only: no ingest batching timers to drain. */
export type AxiomClient = { api: AxiomWithoutBatching };
