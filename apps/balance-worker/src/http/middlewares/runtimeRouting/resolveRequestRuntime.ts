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
	const { identity } = command as { identity: MeteringIdentity };
	const partition = ctx.partitionResolver.partitionForIdentity({ identity });
	if (partition !== route.partition) throw new PartitionRouteMismatchError();
	const runtime = ctx.ownership.findRuntime(route);
	if (runtime) return runtime;
	await ctx.ownership.awaitHandoff?.({ partition });
	throw new PartitionRouteNotOwnedError({
		successor: ctx.ownership.findSuccessor?.({ partition }),
	});
}
