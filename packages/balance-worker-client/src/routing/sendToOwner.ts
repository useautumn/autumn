import {
	requestBudgetHeaderValue,
	WORKER_REQUEST_BUDGET_HEADER,
	WORKER_TRACK_GRANT_LANE_HEADER,
} from "../contracts/worker.js";
import {
	type HttpResponse,
	HttpResponseError,
} from "../http/types/httpClient.js";
import {
	BalanceWorkerClientError,
	type BalanceWorkerClientErrorCode,
	describeRequestRouting,
	type WorkerRequestOutcome,
	type WorkerRequestRouting,
} from "../types/balanceWorkerClientErrors.js";
import { resolveCommandRoute } from "./resolveCommandRoute.js";
import type { RoutedCommand, RoutingContext } from "./types/routing.js";
import {
	assertRequestDeadline,
	canRetryNotReady,
	createRequestDeadline,
	followNotOwnerAnswer,
	isConnectionRefused,
	MAX_NOT_READY_RETRIES,
	MAX_ROUTE_ATTEMPTS,
	ownerStillNotReadyError,
	readNotOwnerResponse,
	refreshCommandRoute,
} from "./workerRequestPolicy.js";

/** The command picks the owner; `payload` rides beside it in the envelope. */
export async function sendToOwner<Response>({
	ctx,
	path,
	command,
	payload,
	signal,
}: {
	ctx: RoutingContext;
	path: string;
	command: RoutedCommand;
	payload?: unknown;
	signal?: AbortSignal;
}): Promise<Response> {
	const deadline = createRequestDeadline({ timeoutMs: ctx.timeoutMs, signal });
	assertRequestDeadline({ deadline, outcome: "not_submitted" });
	// Retries must not observe caller mutations after the first send.
	const snapshot = structuredClone(command);
	const payloadSnapshot =
		payload === undefined ? undefined : structuredClone(payload);
	let outcome: WorkerRequestOutcome = "not_submitted";
	let failureCode: BalanceWorkerClientErrorCode = "OWNERSHIP_UNAVAILABLE";
	const routing: WorkerRequestRouting = {
		sends: 0,
		refreshes: 0,
		followedHint: false,
		notReadyAnswers: 0,
	};
	try {
		// A partition mid-handoff answers NOT_OWNER until its successor is named; the
		// route is refreshed and tried again while the request's budget allows, so a
		// move of a second or two costs the caller latency, not an error. A refresh
		// that outruns its slice hands back too: the route is tried as it stands,
		// and the next stale answer waits on the same refresh again. An answer that
		// names the successor skips the refresh: the old owner wrote that claim itself.
		let followingHint = false;
		let notReadyRetries = 0;
		let lastRefusal: unknown;
		for (let attempt = 0; attempt < MAX_ROUTE_ATTEMPTS; ) {
			failureCode = "OWNERSHIP_UNAVAILABLE";
			assertRequestDeadline({ deadline, outcome });
			if (attempt > 0 && !followingHint) {
				routing.refreshes += 1;
				await refreshCommandRoute({
					owners: ctx.owners,
					deadline,
					timeoutMs: ctx.routeRefreshTimeoutMs,
				});
			}
			followingHint = false;
			const resolved = resolveCommandRoute({ ctx, command: snapshot });
			if (!resolved) {
				if (attempt === 0) {
					attempt += 1;
					continue;
				}
				throw new BalanceWorkerClientError({
					code: "NO_OWNER",
					outcome,
					message: "No worker owns the command partition",
				});
			}
			assertRequestDeadline({ deadline, outcome });
			outcome = "unknown";
			failureCode = "TRANSPORT";
			routing.sends += 1;
			let response: HttpResponse;
			try {
				response = await ctx.http.postJson({
					url: `${resolved.endpoint}${path}`,
					body: {
						route: resolved.route,
						command: snapshot,
						...(payloadSnapshot === undefined
							? {}
							: { payload: payloadSnapshot }),
					},
					headers: {
						[WORKER_REQUEST_BUDGET_HEADER]: requestBudgetHeaderValue({
							expiresAt: deadline.expiresAt,
						}),
						...(ctx.trackGrantLane === undefined
							? {}
							: { [WORKER_TRACK_GRANT_LANE_HEADER]: ctx.trackGrantLane }),
					},
					signal: deadline.signal,
				});
			} catch (cause) {
				if (!isConnectionRefused({ cause })) throw cause;
				routing.sends -= 1;
				lastRefusal = cause;
				outcome = "not_submitted";
				ctx.hints?.drop({
					partition: resolved.route.partition,
					endpoint: resolved.endpoint,
				});
				attempt += 1;
				continue;
			}
			lastRefusal = undefined;
			assertRequestDeadline({ deadline, outcome });
			failureCode = "INVALID_RESPONSE";
			const notOwner = readNotOwnerResponse({ response });
			if (!notOwner) return response.body as Response;
			outcome = "not_submitted";
			followingHint = followNotOwnerAnswer({ ctx, resolved, answer: notOwner });
			if (notOwner.notReady) {
				notReadyRetries += 1;
				routing.notReadyAnswers = notReadyRetries;
				if (
					notReadyRetries > MAX_NOT_READY_RETRIES ||
					!canRetryNotReady({ deadline })
				)
					throw ownerStillNotReadyError();
				continue;
			}
			if (followingHint) routing.followedHint = true;
			attempt += 1;
		}
		if (lastRefusal !== undefined)
			throw new BalanceWorkerClientError({
				code: "TRANSPORT",
				outcome: "not_submitted",
				message: "Worker refused every connection",
				cause: lastRefusal,
			});
		throw new BalanceWorkerClientError({
			code: "ROUTE_STILL_STALE",
			outcome,
			message: "Worker route is still stale after refreshing ownership",
		});
	} catch (cause) {
		if (cause instanceof BalanceWorkerClientError) {
			describeRequestRouting({ error: cause, routing });
			throw cause;
		}
		try {
			assertRequestDeadline({ deadline, outcome });
		} catch (deadlineError) {
			describeRequestRouting({ error: deadlineError, routing });
			throw deadlineError;
		}
		if (failureCode === "TRANSPORT" && cause instanceof HttpResponseError)
			failureCode = "INVALID_RESPONSE";
		const error = new BalanceWorkerClientError({
			code: failureCode,
			outcome,
			message: "Worker request failed",
			cause,
		});
		describeRequestRouting({ error, routing });
		throw error;
	}
}
