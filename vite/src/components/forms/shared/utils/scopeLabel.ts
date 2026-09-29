import type { Entity } from "@autumn/shared";

export const CUSTOMER_LEVEL_LABEL = "Customer-level";

export function scopeLabel({
	entityId,
	entity,
}: {
	entityId: string | null | undefined;
	entity: Pick<Entity, "name"> | null | undefined;
}): string {
	if (!entityId) return CUSTOMER_LEVEL_LABEL;
	return entity?.name || entityId;
}
