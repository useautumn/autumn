import {
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerPlanChange,
} from "@autumn/shared";
import { buildPlanItemChanges } from "./buildPlanItemChanges";
import { buildPreviousAttributes } from "./buildPreviousAttributes";
import { toCustomerPlanSnapshot } from "./toCustomerPlanSnapshot";

export const buildPlanChanges = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): CustomerPlanChange[] => {
	const changes: CustomerPlanChange[] = [];

	for (const cusProduct of autumnBillingPlan.insertCustomerProducts ?? []) {
		const action =
			cusProduct.status === CusProductStatus.Scheduled
				? "scheduled"
				: "activated";
		changes.push({
			action,
			plan: toCustomerPlanSnapshot({ cusProduct }),
			previous_attributes: null,
			item_changes: [],
		});
	}

	const updates = [
		...(autumnBillingPlan.updateCustomerProduct
			? [autumnBillingPlan.updateCustomerProduct]
			: []),
		...(autumnBillingPlan.updateCustomerProducts ?? []),
	];

	for (const update of updates) {
		const originalCusProduct = update.customerProduct;
		const previousAttributes = buildPreviousAttributes({
			originalCusProduct,
			updates: update.updates,
		});
		const action =
			update.updates.status === CusProductStatus.Expired
				? "expired"
				: "updated";

		changes.push({
			action,
			plan: toCustomerPlanSnapshot({
				cusProduct: originalCusProduct,
				overrides: {
					status: update.updates.status,
					canceled_at: update.updates.canceled_at,
					ended_at: update.updates.ended_at,
				},
			}),
			previous_attributes: previousAttributes,
			item_changes: [],
		});
	}

	for (const patch of autumnBillingPlan.patchCustomerProducts ?? []) {
		changes.push({
			action: "updated",
			plan: toCustomerPlanSnapshot({ cusProduct: patch.customerProduct }),
			previous_attributes: {},
			item_changes: buildPlanItemChanges({
				insertCustomerEntitlements: patch.insertCustomerEntitlements,
				deleteCustomerEntitlements: patch.deleteCustomerEntitlements,
			}),
		});
	}

	return changes;
};
