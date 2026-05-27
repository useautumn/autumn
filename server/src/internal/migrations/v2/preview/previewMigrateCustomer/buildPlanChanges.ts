import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullCustomerEntitlement,
} from "@autumn/shared";
import {
	getDeleteCustomerProducts,
	getPatchCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import type {
	PreviewPlanChange,
	PreviewPlanItemChange,
} from "./types/index.js";

const customerProductToPlanChange = ({
	customerProduct,
	action,
	itemChanges = [],
}: {
	customerProduct: FullCusProduct;
	action: PreviewPlanChange["action"];
	itemChanges?: PreviewPlanItemChange[];
}): PreviewPlanChange => ({
	action,
	plan_id: customerProduct.product.id,
	entity_id: customerProduct.entity_id ?? null,
	item_changes: itemChanges,
});

const buildUpdatedPreviousAttributes = ({
	oldCustomerEntitlement,
	newCustomerEntitlement,
}: {
	oldCustomerEntitlement: FullCustomerEntitlement;
	newCustomerEntitlement: FullCustomerEntitlement;
}): Record<string, unknown> => {
	const previous: Record<string, unknown> = {};

	const oldIncluded = oldCustomerEntitlement.entitlement.allowance ?? null;
	const newIncluded = newCustomerEntitlement.entitlement.allowance ?? null;
	if (oldIncluded !== newIncluded) previous.included = oldIncluded;

	const oldUnlimited = Boolean(oldCustomerEntitlement.unlimited);
	const newUnlimited = Boolean(newCustomerEntitlement.unlimited);
	if (oldUnlimited !== newUnlimited) previous.unlimited = oldUnlimited;

	return previous;
};

/**
 * Pair up patch-level insert/delete customer_entitlements that share a
 * `feature_id` and emit a single `"updated"` item_change for each pair.
 * Unpaired inserts/deletes stay as their own `"created"` / `"deleted"`
 * entries. When multiple cusEnts for the same feature are touched (e.g.
 * monthly + lifetime), they pair in arrival order; the dashboard sees N
 * `"updated"` entries for that feature.
 */
const buildPatchItemChanges = ({
	patch,
}: {
	patch: NonNullable<AutumnBillingPlan["patchCustomerProducts"]>[number];
}): PreviewPlanItemChange[] => {
	const changes: PreviewPlanItemChange[] = [];

	const insertsByFeature = new Map<string, FullCustomerEntitlement[]>();
	for (const insert of patch.insertCustomerEntitlements) {
		const featureId = insert.entitlement.feature.id;
		const existing = insertsByFeature.get(featureId) ?? [];
		existing.push(insert);
		insertsByFeature.set(featureId, existing);
	}

	const remainingDeletes: FullCustomerEntitlement[] = [];
	for (const deleted of patch.deleteCustomerEntitlements) {
		const featureId = deleted.entitlement.feature.id;
		const matchingInserts = insertsByFeature.get(featureId);
		const paired = matchingInserts?.shift();
		if (paired) {
			changes.push({
				action: "updated",
				feature_id: featureId,
				previous_attributes: buildUpdatedPreviousAttributes({
					oldCustomerEntitlement: deleted,
					newCustomerEntitlement: paired,
				}),
			});
			continue;
		}
		remainingDeletes.push(deleted);
	}

	for (const inserts of insertsByFeature.values()) {
		for (const insert of inserts) {
			changes.push({
				action: "created",
				feature_id: insert.entitlement.feature.id,
				previous_attributes: {},
			});
		}
	}

	for (const deleted of remainingDeletes) {
		changes.push({
			action: "deleted",
			feature_id: deleted.entitlement.feature.id,
			previous_attributes: {},
		});
	}

	return changes;
};

export const buildPlanChanges = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): PreviewPlanChange[] => [
	...autumnBillingPlan.insertCustomerProducts.map((customerProduct) =>
		customerProductToPlanChange({
			customerProduct,
			action: "created",
		}),
	),
	...getDeleteCustomerProducts({ autumnBillingPlan }).map((customerProduct) =>
		customerProductToPlanChange({
			customerProduct,
			action: "deleted",
		}),
	),
	...getPatchCustomerProducts({ autumnBillingPlan }).map((patch) =>
		customerProductToPlanChange({
			customerProduct: patch.customerProduct,
			action: "updated",
			itemChanges: buildPatchItemChanges({ patch }),
		}),
	),
];
