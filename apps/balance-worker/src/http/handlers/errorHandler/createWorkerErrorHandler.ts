import type { WorkerErrorResponse } from "@autumn/balance-worker-protocol";
import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod/v4";
import {
	OwnedPartitionMismatchError,
	OwnedPartitionNotReadyError,
} from "../../../runtime/runtimeErrors.js";
import {
	PartitionTrackStateNotFoundError,
	PartitionTrackWriterCapacityError,
} from "../../../writer/partitionTrackWriter.js";
import {
	PartitionRouteMismatchError,
	PartitionRouteNotOwnedError,
} from "../../middlewares/runtimeRouting/runtimeRoutingErrors.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
} from "../../types/balanceWorkerHttp.js";

export function createWorkerErrorHandler({
	ctx,
}: {
	ctx: BalanceWorkerHttpContext;
}): ErrorHandler<BalanceWorkerHttpEnv> {
	function respondToWorkerError(
		cause: Error,
		context: Context<BalanceWorkerHttpEnv>,
	) {
		let status: 400 | 409 | 503 | 500 = 500;
		let error: WorkerErrorResponse["error"] = {
			code: "INTERNAL",
			message: "Worker request failed",
		};
		if (
			cause instanceof ZodError ||
			cause instanceof PartitionRouteMismatchError ||
			cause instanceof OwnedPartitionMismatchError ||
			(cause instanceof HTTPException && cause.status === 400)
		) {
			status = 400;
			error = { code: "INVALID_REQUEST", message: "Invalid worker request" };
		} else if (cause instanceof PartitionRouteNotOwnedError) {
			status = 409;
			error = {
				code: "NOT_OWNER",
				message: "Route is not admitted by this worker",
			};
		} else if (
			cause instanceof OwnedPartitionNotReadyError ||
			cause instanceof PartitionTrackWriterCapacityError ||
			cause instanceof PartitionTrackStateNotFoundError
		) {
			status = 503;
			error = {
				code: "NOT_READY",
				message: "Partition cannot accept this request",
			};
		} else {
			ctx.onError({ cause });
		}
		return context.json({ error } satisfies WorkerErrorResponse, status);
	}
	return respondToWorkerError;
}
