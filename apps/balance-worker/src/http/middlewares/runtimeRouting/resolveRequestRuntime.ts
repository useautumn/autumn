import { parseMeteringIdentity } from "@autumn/balance-engine";
import type { PartitionRoute } from "@autumn/balance-worker-client/protocol";
import { z } from "zod/v4";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestContext,
} from "../../types/balanceWorkerHttp.js";
import {
	PartitionRouteMismatchError,
	PartitionRouteNotOwnedError,
} from "./runtimeRoutingErrors.js";

const commandIdentitySchema = z.object({ identity: z.unknown() });

export async function resolveRequestRuntime({
	ctx,
	route,
	command,
}: {
	ctx: BalanceWorkerHttpContext;
	route: PartitionRoute;
	command: unknown;
}): Promise<BalanceWorkerRequestContext["runtime"]> {
	const envelope = commandIdentitySchema.parse(command);
	const identity = parseMeteringIdentity({ input: envelope.identity });
	const partition = ctx.partitionResolver.partitionForIdentity({ identity });
	if (partition !== route.partition) throw new PartitionRouteMismatchError();
	const runtime = ctx.ownership.findRuntime(route);
	if (runtime) return runtime;
	// Mid-handoff the successor is not named yet: answering now would send the caller back here.
	await ctx.ownership.awaitHandoff?.({ partition });
	throw new PartitionRouteNotOwnedError();
}
