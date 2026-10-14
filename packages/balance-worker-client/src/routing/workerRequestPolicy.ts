import type { WorkerErrorResponse } from "../contracts/worker.js";
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

export type RouteRefreshResult = "settled" | "expired";

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
	successor?: PartitionOwner;
	notReady?: true;
};

export const MAX_ROUTE_ATTEMPTS = 4;

const CONNECTION_REFUSED_CODES = new Set(["ConnectionRefused", "ECONNREFUSED"]);

export function isConnectionRefused({ cause }: { cause: unknown }): boolean {
	const visited = new Set<unknown>();
	let current = cause;
	while (
		current !== null &&
		typeof current === "object" &&
		!visited.has(current)
	) {
		visited.add(current);
		const { code } = current as { code?: unknown };
		if (typeof code === "string" && CONNECTION_REFUSED_CODES.has(code))
			return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

export const MAX_NOT_READY_RETRIES = 3;

export const MIN_NOT_READY_RETRY_BUDGET_MS = 200;

export function canRetryNotReady({
	deadline,
	now = performance.now(),
}: {
	deadline: RequestDeadline;
	now?: number;
}): boolean {
	return deadline.expiresAt - now >= MIN_NOT_READY_RETRY_BUDGET_MS;
}

export function readNotOwnerResponse({
	response,
}: {
	response: HttpResponse;
}): NotOwnerAnswer | null {
	if (response.status === 200) return null;
	const error: Partial<WorkerErrorResponse["error"]> =
		(response.body as WorkerErrorResponse | null)?.error ?? {};
	if (error.code === "NOT_OWNER") {
		const successor = readSuccessor({ input: error.successor });
		return successor ? { successor } : {};
	}
	if (error.code === "NOT_READY") return { notReady: true };
	const mayHaveRun = response.status >= 500 && error.code !== "RECORD_REFUSED";
	throw new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: mayHaveRun ? "unknown" : "not_submitted",
		message: error.message ?? `Worker answered ${response.status}`,
		workerCode: error.code,
		workerReason: error.reason,
	});
}

export function ownerStillNotReadyError(): BalanceWorkerClientError {
	return new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "Worker is still activating the partition",
		workerCode: "NOT_READY",
	});
}

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
