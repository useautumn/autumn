import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { queryAxiom } from "@/external/axiom/queryAxiom.js";

const AXIOM_QUERY_VALIDATION_ERROR = /^line: \d+, col: \d+: /;

export const queryLogsAxiom = async (
	params: Parameters<typeof queryAxiom>[0],
) => {
	try {
		return await queryAxiom(params);
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!AXIOM_QUERY_VALIDATION_ERROR.test(error.message)
		) {
			throw error;
		}
		throw new RecaseError({
			message: `Invalid logs query: ${error.message}`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
