import type {
	CustomerPlanItemChange,
	FullCustomerEntitlement,
} from "@autumn/shared";

export const buildPlanItemChanges = ({
	insertCustomerEntitlements,
	deleteCustomerEntitlements,
}: {
	insertCustomerEntitlements?: FullCustomerEntitlement[];
	deleteCustomerEntitlements?: FullCustomerEntitlement[];
}): CustomerPlanItemChange[] => {
	const changes: CustomerPlanItemChange[] = [];

	for (const ent of insertCustomerEntitlements ?? []) {
		changes.push({ action: "created", feature_id: ent.feature_id });
	}
	for (const ent of deleteCustomerEntitlements ?? []) {
		changes.push({ action: "deleted", feature_id: ent.feature_id });
	}

	return changes;
};
