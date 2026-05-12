import { Axiom } from "@axiomhq/js";

const AXIOM_ADMIN_TOKEN = process.env.AXIOM_ADMIN_TOKEN;
const AXIOM_ORG_ID = process.env.AXIOM_ORG_ID;

export const axiomClient: Axiom | null = AXIOM_ADMIN_TOKEN
	? new Axiom({
			token: AXIOM_ADMIN_TOKEN,
			orgId: AXIOM_ORG_ID,
		})
	: null;

export const getAxiomClient = (): Axiom => {
	if (!axiomClient) {
		throw new Error("Axiom is not configured (AXIOM_ADMIN_TOKEN missing)");
	}
	return axiomClient;
};

export const isAxiomConfigured = (): boolean => axiomClient !== null;
