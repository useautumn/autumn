import type {
	CustomerPlanChange,
	CustomerPlanItemChange,
} from "@autumn/shared";
import {
	type EntitlementWithFeature,
	type Feature,
	productItemsToPlanItemsV1,
	toProductItem,
} from "@autumn/shared";
import type { CustomerItemChanges } from "./toCustomerItemChanges.js";

export type EntitlementChange = {
	entitlement: EntitlementWithFeature;
	action: "created" | "deleted";
};

export const buildItemChanges = ({
	changes,
	features,
}: {
	changes: EntitlementChange[];
	features: Feature[];
}): CustomerPlanItemChange[] => {
	const planItems = productItemsToPlanItemsV1({
		items: changes.map((change) => toProductItem({ ent: change.entitlement })),
		features,
	});

	return changes.map((change, index) => ({
		action: change.action,
		feature_id: change.entitlement.feature.id,
		item: planItems[index],
	}));
};

export const buildCreatedItemChanges = ({
	entitlements,
	features,
}: {
	entitlements: EntitlementWithFeature[];
	features: Feature[];
}): CustomerPlanItemChange[] =>
	buildItemChanges({
		changes: entitlements.map((entitlement) => ({
			entitlement,
			action: "created" as const,
		})),
		features,
	});

/**
 * One "updated" plan change per plan that gained items. No subscription /
 * purchase snapshot (both optional in the schema): that needs per customer
 * product lifecycle state this lane deliberately never reads.
 */
export const buildAddedPlanChanges = ({
	addedEntitlementsByPlan,
	features,
}: {
	addedEntitlementsByPlan: CustomerItemChanges["addedEntitlementsByPlan"];
	features: Feature[];
}): CustomerPlanChange[] =>
	[...addedEntitlementsByPlan.values()].map((entitlements) => ({
		action: "updated" as const,
		previous_attributes: null,
		item_changes: buildCreatedItemChanges({ entitlements, features }),
	}));
