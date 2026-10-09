import { getAxiomEnv } from "@autumn/env/axiom";
import { ErrCode, RecaseError } from "@autumn/shared";
import { Axiom } from "@axiomhq/js";
import { StatusCodes } from "http-status-codes";

let axiomClient: Axiom | undefined;

export const getAxiomClient = (): Axiom => {
	const { AXIOM_ADMIN_TOKEN, AXIOM_ORG_ID } = getAxiomEnv();
	if (!AXIOM_ADMIN_TOKEN) {
		throw new RecaseError({
			message: "Log search is currently unavailable.",
			code: ErrCode.InternalError,
			statusCode: StatusCodes.SERVICE_UNAVAILABLE,
		});
	}
	axiomClient ??= new Axiom({
		token: AXIOM_ADMIN_TOKEN,
		orgId: AXIOM_ORG_ID ?? undefined,
	});
	return axiomClient;
};

export const isAxiomConfigured = (): boolean =>
	getAxiomEnv().AXIOM_ADMIN_TOKEN !== null;

let atomAxiomClient: Axiom | undefined;

/** Reads only the dataset every Atom's logs are exported to; null where its token is unset. */
export const getAtomAxiomClient = (): Axiom | null => {
	const { AXIOM_ATOM_ADMIN_TOKEN, AXIOM_ORG_ID } = getAxiomEnv();
	if (!AXIOM_ATOM_ADMIN_TOKEN) return null;
	atomAxiomClient ??= new Axiom({
		token: AXIOM_ATOM_ADMIN_TOKEN,
		orgId: AXIOM_ORG_ID ?? undefined,
	});
	return atomAxiomClient;
};
