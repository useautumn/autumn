import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import { isNewerRoute } from "./createRouteHints.js";
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
	const known = ctx.owners.findOwner({ partition });
	const hint = ctx.hints?.find({ partition });
	// A hint is the claim the ownership topic has yet to deliver; once delivered, the topic's word is newer or equal and the hint is spent.
	if (hint && !isNewerRoute({ candidate: hint, than: known }))
		ctx.hints?.drop({ partition, endpoint: hint.endpoint });
	const owner =
		hint && isNewerRoute({ candidate: hint, than: known }) ? hint : known;
	if (!owner) return undefined;
	return {
		endpoint: owner.endpoint,
		route: { partition: owner.partition, routeEpoch: owner.routeEpoch },
	};
}
