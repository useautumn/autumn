export type EntityDisplayInfo = {
	name?: string | null;
	internal_customer_id?: string | null;
};

/** Resolves the label shown for an entity group: name → id. */
export function entityDisplayLabel({
	entityId,
	entityNames,
}: {
	entityId: string;
	entityNames?: Record<string, EntityDisplayInfo>;
}): string {
	return entityNames?.[entityId]?.name || entityId;
}
