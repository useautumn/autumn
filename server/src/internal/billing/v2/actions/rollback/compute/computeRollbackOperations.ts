import type { AutumnBillingPlan } from "@autumn/shared";
import {
	getDeleteCustomerProducts,
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { operationsOrUndefined } from "@/internal/billing/v2/utils/billingPlan/operationsOrUndefined";
import {
	getReplaceableRestorations,
	invertCustomerEntitlementUpdate,
} from "./invertCustomerEntitlementOperations";
import {
	invertCustomerProductPatch,
	invertCustomerProductUpdate,
} from "./invertCustomerProductOperations";

type RollbackOperations = Pick<
	AutumnBillingPlan,
	| "insertCustomerProducts"
	| "updateCustomerProducts"
	| "deleteCustomerProducts"
	| "patchCustomerProducts"
	| "updateCustomerEntitlements"
>;

export const computeRollbackOperations = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): RollbackOperations => {
	const originalInserts = autumnBillingPlan.insertCustomerProducts;
	const originalDeletes = getDeleteCustomerProducts({ autumnBillingPlan });
	const originalUpdates = getUpdateCustomerProducts({ autumnBillingPlan });
	const originalPatches = getPatchCustomerProducts({ autumnBillingPlan });

	const insertedProductIds = new Set(originalInserts.map(({ id }) => id));
	const deletedProductIds = new Set(originalDeletes.map(({ id }) => id));
	const patchesToReverse = originalPatches.filter(
		({ customerProduct }) =>
			!insertedProductIds.has(customerProduct.id) &&
			!deletedProductIds.has(customerProduct.id),
	);
	const insertedEntitlementIds = new Set(
		patchesToReverse.flatMap(({ insertCustomerEntitlements }) =>
			insertCustomerEntitlements.map(({ id }) => id),
		),
	);
	const deletedEntitlementIds = new Set(
		patchesToReverse.flatMap(({ deleteCustomerEntitlements }) =>
			deleteCustomerEntitlements.map(({ id }) => id),
		),
	);

	const customerProductsToDelete = originalInserts.filter(
		({ id }) => !deletedProductIds.has(id),
	);
	const customerProductsToRestore = originalDeletes.filter(
		({ id }) => !insertedProductIds.has(id),
	);
	const entitlementUpdatesToReverse = (
		autumnBillingPlan.updateCustomerEntitlements ?? []
	).filter(
		({ customerEntitlement }) =>
			!insertedProductIds.has(customerEntitlement.customer_product_id ?? "") &&
			!deletedProductIds.has(customerEntitlement.customer_product_id ?? "") &&
			!insertedEntitlementIds.has(customerEntitlement.id) &&
			!deletedEntitlementIds.has(customerEntitlement.id),
	);

	const updateCustomerEntitlements = [
		...entitlementUpdatesToReverse
			.slice()
			.reverse()
			.map(invertCustomerEntitlementUpdate),
		...getReplaceableRestorations({
			customerProducts: customerProductsToRestore,
			customerEntitlements: patchesToReverse.flatMap(
				({ deleteCustomerEntitlements }) => deleteCustomerEntitlements,
			),
		}),
	];

	return {
		insertCustomerProducts: customerProductsToRestore.slice().reverse(),
		updateCustomerProducts: operationsOrUndefined(
			originalUpdates
				.filter(
					({ customerProduct }) =>
						!insertedProductIds.has(customerProduct.id) &&
						!deletedProductIds.has(customerProduct.id),
				)
				.slice()
				.reverse()
				.map(invertCustomerProductUpdate),
		),
		deleteCustomerProducts: operationsOrUndefined(
			customerProductsToDelete.slice().reverse(),
		),
		patchCustomerProducts: operationsOrUndefined(
			patchesToReverse.slice().reverse().map(invertCustomerProductPatch),
		),
		updateCustomerEntitlements: operationsOrUndefined(
			updateCustomerEntitlements,
		),
	};
};
