import type { RoutingContext } from "../routing/types/routing.js";
import {
	assertRequestDeadline,
	createRequestDeadline,
} from "../routing/workerRequestPolicy.js";
import type {
	StallOwnerParams,
	StallOwnerReply,
} from "../types/balanceWorkerClient.js";
import { BalanceWorkerClientError } from "../types/balanceWorkerClientErrors.js";

export const STALL_REQUEST_TIMEOUT_MS = 5_000;

export async function sendStallOwner({
	ctx,
	partition,
	ms,
	signal,
}: StallOwnerParams & { ctx: RoutingContext }): Promise<StallOwnerReply> {
	let owner = ctx.owners.findOwner({ partition });
	if (!owner) {
		await ctx.owners.refresh();
		owner = ctx.owners.findOwner({ partition });
	}
	if (!owner) {
		throw new BalanceWorkerClientError({
			code: "NO_OWNER",
			outcome: "not_submitted",
			message: `Partition ${partition} has no owner to stall`,
		});
	}
	const deadline = createRequestDeadline({
		timeoutMs: STALL_REQUEST_TIMEOUT_MS,
		signal,
	});
	let response: Awaited<ReturnType<RoutingContext["http"]["postJson"]>>;
	try {
		response = await ctx.http.postJson({
			url: `${owner.endpoint}/v1/debug/stall`,
			body: { ms },
			signal: deadline.signal,
		});
	} catch (cause) {
		assertRequestDeadline({ deadline, outcome: "unknown" });
		throw new BalanceWorkerClientError({
			code: "TRANSPORT",
			outcome: "unknown",
			message: `Stall request to ${owner.endpoint} failed`,
			cause,
		});
	}
	const stallMs =
		typeof response.body === "object" &&
		response.body !== null &&
		"stallMs" in response.body
			? response.body.stallMs
			: undefined;
	if (response.status !== 202 || typeof stallMs !== "number") {
		throw new BalanceWorkerClientError({
			code: "INVALID_RESPONSE",
			outcome: "not_submitted",
			message: `Worker at ${owner.endpoint} did not accept the stall (status ${response.status}); the hook is only routed off prod`,
		});
	}
	return { endpoint: owner.endpoint, stallMs };
}
