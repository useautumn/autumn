import { ErrCode, RecaseError } from "@autumn/shared";
import { Axiom } from "@axiomhq/js";
import { StatusCodes } from "http-status-codes";

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
		throw new RecaseError({
			message: "Log search is currently unavailable.",
			code: ErrCode.InternalError,
			statusCode: StatusCodes.SERVICE_UNAVAILABLE,
		});
	}
	return axiomClient;
};

export const isAxiomConfigured = (): boolean => axiomClient !== null;
