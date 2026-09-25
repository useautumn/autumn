import type { MeteringIdentity } from "@autumn/balance-engine";
import type { PartitionRoute } from "@autumn/balance-worker-client/protocol";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestContext,
} from "../../types/balanceWorkerHttp.js";
import {
	PartitionRouteMismatchError,
	PartitionRouteNotOwnedError,
} from "./runtimeRoutingErrors.js";

export async function resolveRequestRuntime({
	ctx,
	route,
	command,
}: {
	ctx: BalanceWorkerHttpContext;
	route: PartitionRoute;
	command: unknown;
}): Promise<BalanceWorkerRequestContext["runtime"]> {
	// Our server builds the command; routing trusts its identity as sent.
	const { identity } = command as { identity: MeteringIdentity };
	const partition = ctx.partitionResolver.partitionForIdentity({ identity });
	if (partition !== route.partition) throw new PartitionRouteMismatchError();
	const runtime = ctx.ownership.findRuntime(route);
	if (runtime) return runtime;
	// Mid-handoff the successor is not named yet: answering now would send the caller back here.
	await ctx.ownership.awaitHandoff?.({ partition });
	throw new PartitionRouteNotOwnedError();
}
