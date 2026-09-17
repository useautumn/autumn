import { parseMeteringIdentity } from "@autumn/balance-engine";
import type { PartitionRoute } from "@autumn/balance-worker-protocol";
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

export function resolveRequestRuntime({
	ctx,
	route,
	command,
}: {
	ctx: BalanceWorkerHttpContext;
	route: PartitionRoute;
	command: unknown;
}): BalanceWorkerRequestContext["runtime"] {
	const envelope = commandIdentitySchema.parse(command);
	const identity = parseMeteringIdentity({ input: envelope.identity });
	const partition = ctx.partitionResolver.partitionForIdentity({ identity });
	if (partition !== route.partition) throw new PartitionRouteMismatchError();
	const runtime = ctx.ownership.findRuntime(route);
	if (!runtime) throw new PartitionRouteNotOwnedError();
	return runtime;
}
