import { HttpResponseError } from "../http/types/httpClient.js";
import {
	BalanceWorkerClientError,
	type BalanceWorkerClientErrorCode,
	type WorkerRequestOutcome,
} from "../types/balanceWorkerClientErrors.js";
import { resolveCommandRoute } from "./resolveCommandRoute.js";
import type { RoutedCommand, RoutingContext } from "./types/routing.js";
import {
	assertRequestDeadline,
	isNotOwnerResponse,
	refreshCommandRoute,
} from "./workerRequestPolicy.js";

export async function sendToOwner<Response>({
	ctx,
	path,
	command,
	signal,
}: {
	ctx: RoutingContext;
	path: string;
	command: RoutedCommand;
	signal?: AbortSignal;
}): Promise<Response> {
	const deadline = {
		expiresAt: performance.now() + ctx.timeoutMs,
		signal: AbortSignal.timeout(ctx.timeoutMs),
	};
	if (signal) deadline.signal = AbortSignal.any([signal, deadline.signal]);
	assertRequestDeadline({ deadline, outcome: "not_submitted" });
	// Retries must not observe caller mutations after the first send.
	const snapshot = structuredClone(command);
	let outcome: WorkerRequestOutcome = "not_submitted";
	let failureCode: BalanceWorkerClientErrorCode = "OWNERSHIP_UNAVAILABLE";
	try {
		for (let attempt = 0; attempt < 2; attempt++) {
			failureCode = "OWNERSHIP_UNAVAILABLE";
			assertRequestDeadline({ deadline, outcome });
			if (attempt > 0)
				await refreshCommandRoute({ owners: ctx.owners, deadline });
			const resolved = resolveCommandRoute({ ctx, command: snapshot });
			if (!resolved) {
				if (attempt === 0) continue;
				throw new BalanceWorkerClientError({
					code: "NO_OWNER",
					outcome,
					message: "No worker owns the command partition",
				});
			}
			assertRequestDeadline({ deadline, outcome });
			outcome = "unknown";
			failureCode = "TRANSPORT";
			const response = await ctx.http.postJson({
				url: `${resolved.endpoint}${path}`,
				body: { route: resolved.route, command: snapshot },
				signal: deadline.signal,
			});
			assertRequestDeadline({ deadline, outcome });
			failureCode = "INVALID_RESPONSE";
			if (!isNotOwnerResponse({ response })) return response.body as Response;
			outcome = "not_submitted";
		}
		throw new BalanceWorkerClientError({
			code: "ROUTE_STILL_STALE",
			outcome,
			message: "Worker route is still stale after refreshing ownership",
		});
	} catch (cause) {
		if (cause instanceof BalanceWorkerClientError) throw cause;
		assertRequestDeadline({ deadline, outcome });
		if (failureCode === "TRANSPORT" && cause instanceof HttpResponseError)
			failureCode = "INVALID_RESPONSE";
		throw new BalanceWorkerClientError({
			code: failureCode,
			outcome,
			message: "Worker request failed",
			cause,
		});
	}
}
