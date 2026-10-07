import {
	WORKER_ERROR_CODES,
	type WorkerErrorCode,
} from "../contracts/worker.js";
import {
	BALANCE_WORKER_CLIENT_ERROR_CODES,
	BalanceWorkerClientError,
	type BalanceWorkerClientErrorCode,
	WORKER_REQUEST_OUTCOMES,
	type WorkerRequestOutcome,
} from "../types/balanceWorkerClientErrors.js";
import type { BalanceWorkerProxyError } from "./types/balanceWorkerProxy.js";

const clientErrorCodes: ReadonlySet<unknown> = new Set(
	BALANCE_WORKER_CLIENT_ERROR_CODES,
);
const requestOutcomes: ReadonlySet<unknown> = new Set(WORKER_REQUEST_OUTCOMES);
const workerErrorCodes: ReadonlySet<unknown> = new Set(WORKER_ERROR_CODES);

function isClientErrorCode(
	value: unknown,
): value is BalanceWorkerClientErrorCode {
	return clientErrorCodes.has(value);
}

function isRequestOutcome(value: unknown): value is WorkerRequestOutcome {
	return requestOutcomes.has(value);
}

function isWorkerErrorCode(value: unknown): value is WorkerErrorCode {
	return workerErrorCodes.has(value);
}

/** Anything else the API's client throws is a failure after the call may have reached the worker. */
export function errorToProxyError({
	error,
}: {
	error: unknown;
}): BalanceWorkerProxyError {
	if (!(error instanceof BalanceWorkerClientError)) {
		return {
			code: "TRANSPORT",
			outcome: "unknown",
			message: "The balance worker proxy call failed on the API",
		};
	}
	const { code, outcome, message, workerCode, workerReason } = error;
	return { code, outcome, message, workerCode, workerReason };
}

/** Undefined when `error` isn't one the proxy sent. */
export function proxyErrorToClientError({
	error,
}: {
	error: unknown;
}): BalanceWorkerClientError | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	if (!("code" in error && "outcome" in error && "message" in error))
		return undefined;
	const { code, outcome, message } = error;
	if (!(isClientErrorCode(code) && isRequestOutcome(outcome))) return undefined;
	if (typeof message !== "string") return undefined;
	const workerCode =
		"workerCode" in error && isWorkerErrorCode(error.workerCode)
			? error.workerCode
			: undefined;
	const workerReason =
		"workerReason" in error && typeof error.workerReason === "string"
			? error.workerReason
			: undefined;
	return new BalanceWorkerClientError({
		code,
		outcome,
		message,
		workerCode,
		workerReason,
	});
}
