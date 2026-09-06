import {
	type WorkerErrorResponse,
	WorkerProtocolError,
} from "@autumn/balance-worker-client/protocol";
import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod/v4";
import { PartitionProcessorStateNotFoundError } from "../../../processor/common/processorErrors.js";
import {
	PartitionWriterCapacityError,
	PartitionWriterCommandConflictError,
	PartitionWriterStateNotFoundError,
} from "../../../processor/writer/writerErrors.js";
import { OwnedPartitionNotReadyError } from "../../../runtime/runtimeErrors.js";
import {
	PartitionRouteMismatchError,
	PartitionRouteNotOwnedError,
} from "../../middlewares/runtimeRouting/runtimeRoutingErrors.js";
import type { BalanceWorkerHttpEnv } from "../../types/balanceWorkerHttp.js";

export function createWorkerErrorHandler(): ErrorHandler<BalanceWorkerHttpEnv> {
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
			cause instanceof WorkerProtocolError ||
			cause instanceof PartitionRouteMismatchError ||
			(cause instanceof HTTPException && cause.status === 400)
		) {
			status = 400;
			error = { code: "INVALID_REQUEST", message: "Invalid worker request" };
		} else if (cause instanceof PartitionWriterCommandConflictError) {
			status = 400;
			error = {
				code: "INVALID_REQUEST",
				message: "Command id reused with different input",
			};
		} else if (cause instanceof PartitionRouteNotOwnedError) {
			status = 409;
			error = {
				code: "NOT_OWNER",
				message: "Route is not admitted by this worker",
			};
		} else if (
			cause instanceof OwnedPartitionNotReadyError ||
			cause instanceof PartitionWriterCapacityError ||
			cause instanceof PartitionWriterStateNotFoundError ||
			cause instanceof PartitionProcessorStateNotFoundError
		) {
			status = 503;
			error = {
				code: "NOT_READY",
				message: "Partition cannot accept this request",
			};
		}
		const requestLog = context.get("requestLog");
		requestLog.error = cause;
		requestLog.errorCode = error.code;
		return context.json({ error } satisfies WorkerErrorResponse, status);
	}
	return respondToWorkerError;
}
