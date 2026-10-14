import type { WorkerRequestRouting } from "../types/balanceWorkerClientErrors.js";
import { resolveCommandRoute } from "./resolveCommandRoute.js";
import type {
	RequestDeadline,
	ResolvedCommandRoute,
	RoutedCommand,
	RoutingContext,
} from "./types/routing.js";
import { assertRequestDeadline } from "./workerRequestPolicy.js";

export const OWNERLESS_POLL_MS = 50;
export const MIN_OWNERLESS_RETRY_BUDGET_MS = 200;

export async function awaitClaimedRoute({
	ctx,
	command,
	deadline,
	routing,
}: {
	ctx: RoutingContext;
	command: RoutedCommand;
	deadline: RequestDeadline;
	routing: WorkerRequestRouting;
}): Promise<ResolvedCommandRoute | undefined> {
	while (hasBudgetForAnotherLook({ deadline })) {
		await pause({ deadline, ms: OWNERLESS_POLL_MS });
		routing.ownerlessWaits += 1;
		const resolved = resolveCommandRoute({ ctx, command });
		if (resolved) return resolved;
	}
	return undefined;
}

function hasBudgetForAnotherLook({
	deadline,
}: {
	deadline: RequestDeadline;
}): boolean {
	const remainingMs = deadline.expiresAt - performance.now();
	return remainingMs >= OWNERLESS_POLL_MS + MIN_OWNERLESS_RETRY_BUDGET_MS;
}

async function pause({
	deadline,
	ms,
}: {
	deadline: RequestDeadline;
	ms: number;
}): Promise<void> {
	const paused = Promise.withResolvers<void>();
	function resume(): void {
		paused.resolve();
	}
	const timer = setTimeout(resume, ms);
	deadline.signal.addEventListener("abort", resume, { once: true });
	try {
		await paused.promise;
	} finally {
		clearTimeout(timer);
		deadline.signal.removeEventListener("abort", resume);
	}
	assertRequestDeadline({ deadline, outcome: "not_submitted" });
}
