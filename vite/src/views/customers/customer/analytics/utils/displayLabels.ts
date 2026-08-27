import type { CustomerDisplayInfo, EntityDisplayInfo } from "@autumn/shared";

/** Bucket the analytics pipe folds every group value beyond the top N into. */
export const RESERVED_GROUP = "AUTUMN_RESERVED";

/** Resolves the label shown for a customer group: name → email → id. */
export function customerDisplayLabel({
	customerId,
	customerNames,
}: {
	customerId: string;
	customerNames?: Record<string, CustomerDisplayInfo>;
}): string {
	const info = customerNames?.[customerId];
	return info?.name || info?.email || customerId;
}

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

/** Resolves the label for any group value, including the catch-all bucket. */
export function groupValueLabel({
	groupValue,
	groupBy,
	entityNames,
	customerNames,
	planNames,
}: {
	groupValue: string;
	groupBy: string | null;
	entityNames?: Record<string, EntityDisplayInfo>;
	customerNames?: Record<string, CustomerDisplayInfo>;
	planNames?: Record<string, string>;
}): string {
	if (groupValue === RESERVED_GROUP) return "Other values";
	if (groupBy === "entity_id") {
		return entityDisplayLabel({ entityId: groupValue, entityNames });
	}
	if (groupBy === "customer_id") {
		return customerDisplayLabel({ customerId: groupValue, customerNames });
	}
	if (groupBy === "plan_id") {
		if (groupValue === "") return "No plan";
		return planNames?.[groupValue] ?? groupValue;
	}
	return groupValue;
}
