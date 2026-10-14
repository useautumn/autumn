import type { CustomerPlanChange } from "@autumn/shared";

export const planChangesToEntityId = ({
	planChanges,
}: {
	planChanges: CustomerPlanChange[];
}): string | undefined => {
	const entityIds = new Set(planChanges.map((change) => change.entity_id));
	if (entityIds.size !== 1) return undefined;

	return planChanges[0].entity_id ?? undefined;
};
