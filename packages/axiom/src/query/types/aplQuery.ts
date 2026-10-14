import type { AxiomClient } from "../../types/axiomClient.js";

export type AplQueryContext = { axiom: AxiomClient };

export type AplQuery = {
	apl: string;
	startTime?: string;
	endTime?: string;
};

export type AplRow = Record<string, unknown>;
