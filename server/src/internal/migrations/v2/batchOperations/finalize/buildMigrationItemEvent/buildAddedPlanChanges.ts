import {
	type EntitlementWithFeature,
	type Feature,
	productItemsToPlanItemsV1,
	toProductItem,
} from "@autumn/shared";
import type {
	CustomerPlanChange,
	CustomerPlanItemChange,
} from "@autumn/shared";
import type { CustomerItemChanges } from "./toCustomerItemChanges.js";

/** `created` item changes for entitlements the migration added. */
export const buildCreatedItemChanges = ({
	entitlements,
	features,
}: {
	entitlements: EntitlementWithFeature[];
	features: Feature[];
}): CustomerPlanItemChange[] => {
	const planItems = productItemsToPlanItemsV1({
		items: entitlements.map((entitlement) =>
			toProductItem({ ent: entitlement }),
		),
		features,
	});

	return entitlements.map((entitlement, index) => ({
		action: "created" as const,
		feature_id: entitlement.feature.id,
		item: planItems[index],
	}));
};

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
