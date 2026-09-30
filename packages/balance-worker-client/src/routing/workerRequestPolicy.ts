import {
	type WorkerErrorResponse,
	workerErrorStatus,
} from "../contracts/worker.js";
import type { HttpResponse } from "../http/types/httpClient.js";
import {
	BalanceWorkerClientError,
	type WorkerRequestOutcome,
} from "../types/balanceWorkerClientErrors.js";
import type {
	PartitionOwner,
	PartitionOwners,
	RequestDeadline,
	ResolvedCommandRoute,
	RoutingContext,
} from "./types/routing.js";

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

/** Gives an ownership refresh its own slice so a request can stop waiting on it
 *  without giving up its remaining budget: the slice ending is not a failure,
 *  it hands the caller back to try the route it has while the refresh runs on.
 *  Cancelling before the timer fires means the promise never settles, so
 *  nothing is left dangling. */
function startRefreshExpiry({ timeoutMs }: { timeoutMs: number }): {
	expired: Promise<RouteRefreshResult>;
	cancel(): void;
} {
	const expiry = Promise.withResolvers<RouteRefreshResult>();
	function expire(): void {
		expiry.resolve("expired");
	}
	const timer = setTimeout(expire, timeoutMs);
	function cancel(): void {
		clearTimeout(timer);
	}
	return { expired: expiry.promise, cancel };
}

/** "settled" once ownership caught up; "expired" when the refresh outran its slice. */
export type RouteRefreshResult = "settled" | "expired";

/** Waits for ownership to catch up, but only for `timeoutMs` of the request's budget.
 *  A refresh that outruns that slice is not a failure: it keeps running, and the
 *  caller tries the route it has, then refreshes again if that route is still stale.
 *  During a fleet swap every server refreshes at once while a hundred-odd claims
 *  land on the ownership topic, and failing the request the moment one slice
 *  passed turned that into fail-opens with most of the request's budget unspent.
 *  A refresh that fails, or a deadline that passes, still throws. */
export async function refreshCommandRoute({
	owners,
	deadline,
	timeoutMs,
}: {
	owners: PartitionOwners;
	deadline: RequestDeadline;
	timeoutMs?: number;
}): Promise<RouteRefreshResult> {
	assertRequestDeadline({ deadline, outcome: "not_submitted" });
	const interrupted = Promise.withResolvers<never>();
	function abort(): void {
		interrupted.reject(deadline.signal.reason);
	}
	deadline.signal.addEventListener("abort", abort, { once: true });
	// Deliberately not awaited on its own: the refresh outlives a request that
	// stops waiting, so whoever routes next finds ownership already settled.
	const refreshing = owners.refresh();
	async function settle(): Promise<RouteRefreshResult> {
		await refreshing;
		return "settled";
	}
	const racing: Promise<RouteRefreshResult>[] = [settle(), interrupted.promise];
	const expiry =
		timeoutMs === undefined ? undefined : startRefreshExpiry({ timeoutMs });
	if (expiry) racing.push(expiry.expired);
	try {
		const result = await Promise.race(racing);
		assertRequestDeadline({ deadline, outcome: "not_submitted" });
		return result;
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
	return readNotOwnerResponse({ response }) !== null;
}

export type NotOwnerAnswer = {
	/** Where the old owner says the partition went; absent while its handoff is unnamed or released. */
	successor?: PartitionOwner;
	/** The route was right but its owner is still activating the partition: the same route is tried again. */
	notReady?: true;
};

/** How many attempts in a row may end at a NOT_READY owner before the request gives up on it. */
export const MAX_NOT_READY_RETRIES = 3;

/** Null for a success; the NOT_OWNER answer with any successor it names, or a NOT_READY
 *  answer from an owner still activating; throws for every other worker error. */
export function readNotOwnerResponse({
	response,
}: {
	response: HttpResponse;
}): NotOwnerAnswer | null {
	if (response.status === 200) return null;
	const error = (response.body as WorkerErrorResponse | null)?.error;
	if (!error || workerErrorStatus({ code: error.code }) !== response.status)
		throw new Error("Worker error does not match HTTP status");
	if (error.code === "NOT_OWNER") {
		const successor = readSuccessor({ input: error.successor });
		return successor ? { successor } : {};
	}
	// A successor named a moment ago is still fencing and catching up. It held the
	// request for its activation wait and gave up first; the activation is usually a
	// second or so, so the request tries the same owner again while its budget lasts.
	if (error.code === "NOT_READY") return { notReady: true };
	throw new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: error.code === "INTERNAL" ? "unknown" : "not_submitted",
		message: error.message,
		workerCode: error.code,
		workerReason: error.reason,
	});
}

/** The owner was still activating on every retry the request had; the same error a single NOT_READY raised before retries existed. */
export function ownerStillNotReadyError(): BalanceWorkerClientError {
	return new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "Worker is still activating the partition",
		workerCode: "NOT_READY",
	});
}

/** A hint that does not parse is no hint: the refresh path still works without it. */
function readSuccessor({
	input,
}: {
	input: unknown;
}): PartitionOwner | undefined {
	if (typeof input !== "object" || input === null) return undefined;
	const { partition, routeEpoch, endpoint } = input as Record<string, unknown>;
	if (!Number.isSafeInteger(partition) || (partition as number) < 0)
		return undefined;
	if (typeof routeEpoch !== "string" || !/^\d+$/.test(routeEpoch))
		return undefined;
	if (typeof endpoint !== "string" || endpoint.trim().length === 0)
		return undefined;
	return { partition: partition as number, routeEpoch, endpoint };
}

/** True when the next attempt should go to the route already in hand: a named successor is
 *  kept for it, and an owner still activating is simply tried again. A plain NOT_OWNER
 *  forgets any hint the answering endpoint carried, so the next attempt refreshes. */
export function followNotOwnerAnswer({
	ctx,
	resolved,
	answer,
}: {
	ctx: Pick<RoutingContext, "owners" | "hints">;
	resolved: ResolvedCommandRoute;
	answer: NotOwnerAnswer;
}): boolean {
	if (answer.notReady) return true;
	const { partition } = resolved.route;
	const { successor } = answer;
	if (
		successor &&
		successor.partition === partition &&
		ctx.hints?.adopt({ successor, known: ctx.owners.findOwner({ partition }) })
	)
		return true;
	ctx.hints?.drop({ partition, endpoint: resolved.endpoint });
	return false;
}
