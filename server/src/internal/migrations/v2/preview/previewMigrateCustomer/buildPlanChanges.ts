import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
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

const buildPatchItemChanges = ({
	patch,
}: {
	patch: NonNullable<AutumnBillingPlan["patchCustomerProducts"]>[number];
}): PreviewPlanItemChange[] => [
	...patch.insertCustomerEntitlements.map((customerEntitlement) => ({
		action: "created" as const,
		feature_id: customerEntitlement.entitlement.feature.id,
	})),
	...patch.deleteCustomerEntitlements.map((customerEntitlement) => ({
		action: "deleted" as const,
		feature_id: customerEntitlement.entitlement.feature.id,
	})),
];

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
