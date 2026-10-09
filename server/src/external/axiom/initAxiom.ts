import { ErrCode, RecaseError } from "@autumn/shared";
import { Axiom } from "@axiomhq/js";
import { StatusCodes } from "http-status-codes";

let axiomClient: Axiom | undefined;

export const getAxiomClient = (): Axiom => {
	const token = process.env.AXIOM_ADMIN_TOKEN;
	if (!token) {
		throw new RecaseError({
			message: "Log search is currently unavailable.",
			code: ErrCode.InternalError,
			statusCode: StatusCodes.SERVICE_UNAVAILABLE,
		});
	}
	axiomClient ??= new Axiom({ token, orgId: process.env.AXIOM_ORG_ID });
	return axiomClient;
};

export const isAxiomConfigured = (): boolean =>
	Boolean(process.env.AXIOM_ADMIN_TOKEN);

let atomAxiomClient: Axiom | undefined;

/** Reads only the dataset every Atom's logs are exported to; null where its token is unset. */
export const getAtomAxiomClient = (): Axiom | null => {
	const token = process.env.AXIOM_ATOM_ADMIN_TOKEN;
	if (!token) return null;
	atomAxiomClient ??= new Axiom({ token, orgId: process.env.AXIOM_ORG_ID });
	return atomAxiomClient;
};
