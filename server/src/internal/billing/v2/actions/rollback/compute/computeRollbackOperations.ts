import type { AutumnBillingPlan } from "@autumn/shared";
import {
	applyCustomerProductPatch,
	applyCustomerProductUpdate,
	getDeleteCustomerProducts,
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

type RollbackOperations = Pick<
	AutumnBillingPlan,
	| "insertCustomerProducts"
	| "updateCustomerProducts"
	| "deleteCustomerProducts"
	| "patchCustomerProducts"
	| "updateCustomerEntitlements"
>;

const undefinedIfEmpty = <T>(values: T[]) =>
	values.length > 0 ? values : undefined;

const getPreviousValues = <T extends object, U extends object>({
	before,
	updates,
}: {
	before: T;
	updates: U;
}): U =>
	Object.fromEntries(
		Object.keys(updates).map((key) => [key, before[key as keyof T]]),
	) as U;

const invertCustomerProductUpdate = ({
	customerProduct,
	updates,
}: NonNullable<AutumnBillingPlan["updateCustomerProducts"]>[number]) => ({
	customerProduct: applyCustomerProductUpdate({ customerProduct, updates }),
	updates: getPreviousValues({ before: customerProduct, updates }),
});

const invertCustomerProductPatch = (
	patch: NonNullable<AutumnBillingPlan["patchCustomerProducts"]>[number],
) => ({
	customerProduct: applyCustomerProductPatch({
		customerProduct: patch.customerProduct,
		patch,
	}),
	insertCustomerEntitlements: patch.deleteCustomerEntitlements,
	insertCustomerPrices: patch.deleteCustomerPrices,
	deleteCustomerEntitlements: patch.insertCustomerEntitlements,
	deleteCustomerPrices: patch.insertCustomerPrices,
});

const invertCustomerEntitlementUpdate = (
	update: NonNullable<AutumnBillingPlan["updateCustomerEntitlements"]>[number],
) =>
	update.updates
		? {
				customerEntitlement: update.customerEntitlement,
				updates: getPreviousValues({
					before: update.customerEntitlement,
					updates: update.updates,
				}),
			}
		: {
				customerEntitlement: update.customerEntitlement,
				balanceChange: update.balanceChange ? -update.balanceChange : undefined,
				insertReplaceables: update.deletedReplaceables,
				deletedReplaceables: update.insertReplaceables?.map((replaceable) => ({
					...replaceable,
					from_entity_id: replaceable.from_entity_id ?? null,
					delete_next_cycle: replaceable.delete_next_cycle ?? false,
				})),
			};

const getReplaceableRestorations = ({
	customerProducts,
	customerEntitlements,
}: {
	customerProducts: NonNullable<AutumnBillingPlan["deleteCustomerProducts"]>;
	customerEntitlements: NonNullable<
		AutumnBillingPlan["patchCustomerProducts"]
	>[number]["deleteCustomerEntitlements"];
}): NonNullable<AutumnBillingPlan["updateCustomerEntitlements"]> =>
	[
		...customerProducts.flatMap(
			({ customer_entitlements }) => customer_entitlements,
		),
		...customerEntitlements,
	]
		.filter(({ replaceables }) => replaceables.length > 0)
		.map((customerEntitlement) => ({
			customerEntitlement,
			insertReplaceables: customerEntitlement.replaceables,
		}));

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
		updateCustomerProducts: undefinedIfEmpty(
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
		deleteCustomerProducts: undefinedIfEmpty(
			customerProductsToDelete.slice().reverse(),
		),
		patchCustomerProducts: undefinedIfEmpty(
			patchesToReverse.slice().reverse().map(invertCustomerProductPatch),
		),
		updateCustomerEntitlements: undefinedIfEmpty(updateCustomerEntitlements),
	};
};
