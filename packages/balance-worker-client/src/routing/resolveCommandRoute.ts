import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import type {
	ResolvedCommandRoute,
	RoutedCommand,
	RoutingContext,
} from "./types/routing.js";

export function resolveCommandRoute({
	ctx,
	command,
}: {
	ctx: RoutingContext;
	command: RoutedCommand;
}): ResolvedCommandRoute | undefined {
	const partition = meteringIdentityToPartition({
		identity: command.identity,
		partitionCount: ctx.partitionCount,
	});
	const owner = ctx.owners.findOwner({ partition });
	if (!owner) return undefined;
	return {
		endpoint: owner.endpoint,
		route: { partition: owner.partition, routeEpoch: owner.routeEpoch },
	};
}
