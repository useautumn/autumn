import { approvalErrorResult, isErrorResult } from "./approvalErrors.js";
import { permissionDenialText } from "./permissionDenialText.js";
import { readPermissionDeniedError } from "./readPermissionDeniedError.js";

/** `unknown` = the call may or may not have reached the server — never
 * auto-retried, a re-run could double-charge. */
export type WriteExecutionOutcome =
	| { detail?: string; result: unknown; status: "applied" }
	| { detail: string; status: "failed" }
	| { detail: string; status: "unknown" };

export const classifyWriteExecution = ({
	error,
	result,
}: {
	error?: unknown;
	result?: unknown;
}): WriteExecutionOutcome => {
	if (error !== undefined) {
		return { detail: approvalErrorResult(error).message, status: "unknown" };
	}
	if (isErrorResult(result)) {
		const denial = readPermissionDeniedError(result);
		const detail = denial
			? permissionDenialText({ denial })
			: approvalErrorResult(result).message;
		return { detail, status: "failed" };
	}
	return { result, status: "applied" };
};
