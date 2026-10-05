import type { WorkerErrorResponse } from "@autumn/balance-worker-client/protocol";
import type { Context, ErrorHandler } from "hono";
import { CheckCapacityError } from "../../../processor/common/processorErrors.js";
import { RequestPastDeadlineError } from "../../../runtime/runtimeErrors.js";
import type {
	BalanceWorkerHttpEnv,
	RequestShedReason,
} from "../../types/balanceWorkerHttp.js";
import { workerErrorOf } from "./workerErrorOf.js";

export function createWorkerErrorHandler(): ErrorHandler<BalanceWorkerHttpEnv> {
	function respondToWorkerError(
		cause: Error,
		context: Context<BalanceWorkerHttpEnv>,
	) {
		const { status, error } = workerErrorOf({ cause });
		const requestLog = context.get("requestLog");
		const shed = shedReasonOf({ cause });
		// Overload arrives in floods, and serialising a stack per rejection cost more
		// CPU than accepting the request did, collapsing throughput on staging.
		if (error.code !== "OVERLOADED" && !shed) requestLog.error = cause;
		requestLog.errorCode = error.code;
		requestLog.shed = shed;
		return context.json({ error } satisfies WorkerErrorResponse, status);
	}
	return respondToWorkerError;
}

function shedReasonOf({
	cause,
}: {
	cause: Error;
}): RequestShedReason | undefined {
	if (cause instanceof RequestPastDeadlineError) return "past_deadline";
	if (cause instanceof CheckCapacityError) return "check_capacity";
	return undefined;
}
