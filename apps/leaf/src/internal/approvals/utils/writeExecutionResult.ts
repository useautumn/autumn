import { approvalErrorResult, isErrorResult } from "./approvalErrors.js";

export type WriteExecutionOutcome =
	| { detail?: string; result: unknown; status: "applied" }
	| { detail: string; status: "failed" }
	/** The call may or may not have reached the server — NEVER auto-retried,
	 * a re-run could double-charge. */
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
