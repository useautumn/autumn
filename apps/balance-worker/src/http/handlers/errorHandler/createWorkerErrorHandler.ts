import type { WorkerErrorResponse } from "@autumn/balance-worker-client/protocol";
import type { Context, ErrorHandler } from "hono";
import type { BalanceWorkerHttpEnv } from "../../types/balanceWorkerHttp.js";
import { workerErrorOf } from "./workerErrorOf.js";

export function createWorkerErrorHandler(): ErrorHandler<BalanceWorkerHttpEnv> {
	function respondToWorkerError(
		cause: Error,
		context: Context<BalanceWorkerHttpEnv>,
	) {
		const { status, error } = workerErrorOf({ cause });
		const requestLog = context.get("requestLog");
		if (error.code !== "OVERLOADED") requestLog.error = cause;
		requestLog.errorCode = error.code;
		return context.json({ error } satisfies WorkerErrorResponse, status);
	}
	return respondToWorkerError;
}
