import type {
	CustomerDisplayInfo,
	EntityDisplayInfo,
	Feature,
} from "@autumn/shared";

export const SOURCE_FEATURE_GROUP = "source_feature_id";

export const RESERVED_GROUP = "AUTUMN_RESERVED";

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

export function entityDisplayLabel({
	entityId,
	entityNames,
}: {
	entityId: string;
	entityNames?: Record<string, EntityDisplayInfo>;
}): string {
	return entityNames?.[entityId]?.name || entityId;
}

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

export const groupByLabel = ({ groupBy }: { groupBy: string }): string =>
	BUILT_IN_GROUP_LABELS[groupBy] ?? groupBy;
