import type { AxiomClient } from "../../types/axiomClient.js";

export type AplQueryContext = { axiom: AxiomClient };

export type AplQuery = {
	apl: string;
	/** ISO timestamps; the APL's own `_time` filters still apply. */
	startTime?: string;
	endTime?: string;
};

/** One result row: column name → value, as the query's `summarize`/`project` named them. */
export type AplRow = Record<string, unknown>;
