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

export async function refreshCommandRoute({
	owners,
	deadline,
}: {
	owners: PartitionOwners;
	deadline: RequestDeadline;
}): Promise<void> {
	assertRequestDeadline({ deadline, outcome: "not_submitted" });
	const interrupted = Promise.withResolvers<never>();
	function abort(): void {
		interrupted.reject(deadline.signal.reason);
	}
	deadline.signal.addEventListener("abort", abort, { once: true });
	try {
		await Promise.race([owners.refresh(), interrupted.promise]);
		assertRequestDeadline({ deadline, outcome: "not_submitted" });
	} finally {
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
	});
}
