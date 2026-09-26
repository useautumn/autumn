import type {
	CustomerDisplayInfo,
	EntityDisplayInfo,
	Feature,
} from "@autumn/shared";

/** Deductions split by the tracked feature that caused them unless told otherwise. */
export const SOURCE_FEATURE_GROUP = "source_feature_id";

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
	features,
}: {
	groupValue: string;
	groupBy: string | null;
	entityNames?: Record<string, EntityDisplayInfo>;
	customerNames?: Record<string, CustomerDisplayInfo>;
	planNames?: Record<string, string>;
	features?: Feature[];
}): string {
	if (groupValue === RESERVED_GROUP) return "Other values";
	if (groupBy === "entity_id") {
		return entityDisplayLabel({ entityId: groupValue, entityNames });
	}
	if (groupBy === "customer_id") {
		return customerDisplayLabel({ customerId: groupValue, customerNames });
	}
	if (groupBy === SOURCE_FEATURE_GROUP) {
		return (
			features?.find((feature) => feature.id === groupValue)?.name ?? groupValue
		);
	}
	if (groupBy === "plan_id") {
		if (groupValue === "") return "No plan";
		return planNames?.[groupValue] ?? groupValue;
	}
	return groupValue;
}

const BUILT_IN_GROUP_LABELS: Record<string, string> = {
	customer_id: "Customer",
	entity_id: "Entity",
	plan_id: "Plan",
	[SOURCE_FEATURE_GROUP]: "Source feature",
};

/** The name shown for what the chart is grouped by. */
export const groupByLabel = ({ groupBy }: { groupBy: string }): string =>
	BUILT_IN_GROUP_LABELS[groupBy] ?? groupBy;
