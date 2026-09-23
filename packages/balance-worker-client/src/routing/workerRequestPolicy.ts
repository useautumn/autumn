import {
	type WorkerErrorResponse,
	workerErrorStatus,
} from "../contracts/worker.js";
import type { HttpResponse } from "../http/types/httpClient.js";
import {
	BalanceWorkerClientError,
	type WorkerRequestOutcome,
} from "../types/balanceWorkerClientErrors.js";
import type { PartitionOwners, RequestDeadline } from "./types/routing.js";

/** A request's whole budget: the client timeout, cut short by the caller's signal. */
export function createRequestDeadline({
	timeoutMs,
	signal,
}: {
	timeoutMs: number;
	signal?: AbortSignal;
}): RequestDeadline {
	const timeout = AbortSignal.timeout(timeoutMs);
	return {
		expiresAt: performance.now() + timeoutMs,
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
	};
}

export function assertRequestDeadline({
	deadline,
	outcome,
}: {
	deadline: RequestDeadline;
	outcome: WorkerRequestOutcome;
}): void {
	if (!deadline.signal.aborted && performance.now() < deadline.expiresAt)
		return;
	const timedOut =
		performance.now() >= deadline.expiresAt ||
		(deadline.signal.reason instanceof DOMException &&
			deadline.signal.reason.name === "TimeoutError");
	throw new BalanceWorkerClientError({
		code: timedOut ? "DEADLINE" : "ABORTED",
		outcome,
		message: timedOut
			? "Worker request deadline exceeded"
			: "Worker request aborted",
		cause: deadline.signal.reason,
	});
}

/** Gives an ownership refresh its own expiry so a request can stop waiting on it
 *  without giving up its remaining budget. Cancelling before the timer fires
 *  means the rejection never happens, so nothing is left unhandled. */
function startRefreshExpiry({ timeoutMs }: { timeoutMs: number }): {
	expired: Promise<never>;
	cancel(): void;
} {
	const expiry = Promise.withResolvers<never>();
	function expire(): void {
		expiry.reject(
			new BalanceWorkerClientError({
				code: "OWNERSHIP_UNAVAILABLE",
				outcome: "not_submitted",
				message: "Ownership did not settle within the route refresh budget",
			}),
		);
	}
	const timer = setTimeout(expire, timeoutMs);
	function cancel(): void {
		clearTimeout(timer);
	}
	return { expired: expiry.promise, cancel };
}

export async function refreshCommandRoute({
	owners,
	deadline,
	timeoutMs,
}: {
	owners: PartitionOwners;
	deadline: RequestDeadline;
	timeoutMs?: number;
}): Promise<void> {
	assertRequestDeadline({ deadline, outcome: "not_submitted" });
	const interrupted = Promise.withResolvers<never>();
	function abort(): void {
		interrupted.reject(deadline.signal.reason);
	}
	deadline.signal.addEventListener("abort", abort, { once: true });
	// Deliberately not awaited on its own: the refresh outlives a request that
	// stops waiting, so whoever routes next finds ownership already settled.
	const refreshing = owners.refresh();
	const racing: Promise<unknown>[] = [refreshing, interrupted.promise];
	const expiry =
		timeoutMs === undefined ? undefined : startRefreshExpiry({ timeoutMs });
	if (expiry) racing.push(expiry.expired);
	try {
		await Promise.race(racing);
		assertRequestDeadline({ deadline, outcome: "not_submitted" });
	} finally {
		expiry?.cancel();
		deadline.signal.removeEventListener("abort", abort);
	}
}

export function isNotOwnerResponse({
	response,
}: {
	response: HttpResponse;
}): boolean {
	if (response.status === 200) return false;
	const error = (response.body as WorkerErrorResponse | null)?.error;
	if (!error || workerErrorStatus({ code: error.code }) !== response.status)
		throw new Error("Worker error does not match HTTP status");
	if (error.code === "NOT_OWNER") return true;
	throw new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: error.code === "INTERNAL" ? "unknown" : "not_submitted",
		message: error.message,
		workerCode: error.code,
		workerReason: error.reason,
	});
}
