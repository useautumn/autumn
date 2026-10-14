import type { AxiomWithoutBatching } from "@axiomhq/js";

export type AxiomClientConfig = {
	token: string;
	orgId?: string;
};

export type AxiomClient = { api: AxiomWithoutBatching };
