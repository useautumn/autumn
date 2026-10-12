/** Autumn's own Atom is private to prod's VPC, so only ECS tasks ask it first. */
export const billingEdgeUrl = ({
	onEcs,
	edgeUrl,
}: {
	onEcs: boolean;
	edgeUrl: string | undefined;
}): string | undefined => (onEcs ? edgeUrl : undefined);
