import { approvalErrorResult, isErrorResult } from "./approvalErrors.js";

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
		return { detail: approvalErrorResult(result).message, status: "failed" };
	}
	return { result, status: "applied" };
};
