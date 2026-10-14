import type {
	AutumnBillingPlan,
	BillingContext,
	FullCustomer,
} from "@autumn/shared";
import { applyCustomerLicensePlanOps } from "@/internal/billing/v2/utils/billingPlan/applyCustomerLicensePlanOps";
import { applyPooledBalancePlanToFullCustomer } from "@/internal/billing/v2/utils/billingPlan/applyPooledBalancePlanToFullCustomer";
import {
	applyCustomerProductPatch,
	applyCustomerProductUpdate,
	getDeleteCustomerProducts,
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

export const applyAutumnBillingPlanToFullCustomer = ({
	fullCustomer,
	autumnBillingPlan,
}: {
	fullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { insertCustomerProducts, updateCustomerEntitlements } =
		autumnBillingPlan;
	const deleteCustomerProducts = getDeleteCustomerProducts({
		autumnBillingPlan,
	});
	const patchCustomerProducts = getPatchCustomerProducts({ autumnBillingPlan });
	const updateCustomerProducts = getUpdateCustomerProducts({
		autumnBillingPlan,
	});

	const finalFullCustomer = structuredClone(fullCustomer);

	const combinedCustomerProducts = [
		...finalFullCustomer.customer_products,
		...insertCustomerProducts,
	];

	let customerProducts = combinedCustomerProducts.map((customerProduct) => {
		let result = customerProduct;
		for (const updateCustomerProduct of updateCustomerProducts) {
			if (updateCustomerProduct.customerProduct.id !== customerProduct.id) {
				continue;
			}

			result = applyCustomerProductUpdate({
				customerProduct: result,
				updates: updateCustomerProduct.updates,
			});
		}

		for (const patchCustomerProduct of patchCustomerProducts) {
			if (patchCustomerProduct.customerProduct.id !== customerProduct.id) {
				continue;
			}

			result = applyCustomerProductPatch({
				customerProduct: result,
				patch: patchCustomerProduct,
			});
		}

		return result;
	});

	if (deleteCustomerProducts.length > 0) {
		const deletedIds = new Set(
			deleteCustomerProducts.map((customerProduct) => customerProduct.id),
		);
		customerProducts = customerProducts.filter(
			(customerProduct) => !deletedIds.has(customerProduct.id),
		);
	}

	if (updateCustomerEntitlements) {
		const entitlementById = new Map(
			customerProducts
				.flatMap((customerProduct) => customerProduct.customer_entitlements)
				.map((entitlement) => [entitlement.id, entitlement]),
		);

		for (const update of updateCustomerEntitlements) {
			const entitlement = entitlementById.get(update.customerEntitlement.id);
			if (!entitlement) continue;

			if (update.updates) {
				if (update.updates.reset_cycle_anchor !== undefined) {
					entitlement.reset_cycle_anchor = update.updates.reset_cycle_anchor;
				}

				if (update.updates.next_reset_at !== undefined) {
					entitlement.next_reset_at = update.updates.next_reset_at;
				}

				if (update.updates.balance !== undefined) {
					entitlement.balance = update.updates.balance;
				}

				if (update.updates.adjustment !== undefined) {
					entitlement.adjustment = update.updates.adjustment;
				}

				if (update.updates.entities !== undefined) {
					entitlement.entities = update.updates.entities;
				}
			}

			entitlement.balance =
				(entitlement.balance ?? 0) + (update.balanceChange ?? 0);

			if (update.insertReplaceables && update.insertReplaceables.length > 0) {
				entitlement.replaceables = [
					...(entitlement.replaceables ?? []),
					...update.insertReplaceables.map((r) => ({
						...r,
						delete_next_cycle: r.delete_next_cycle ?? false,
					})),
				];
			}

			if (update.deletedReplaceables && update.deletedReplaceables.length > 0) {
				entitlement.replaceables = entitlement.replaceables?.filter(
					(r) => !update.deletedReplaceables?.map((dr) => dr.id).includes(r.id),
				);
			}
		}
	}

	customerProducts = applyCustomerLicensePlanOps({
		customerProducts,
		autumnBillingPlan,
	});
	finalFullCustomer.customer_products = customerProducts;
	applyPooledBalancePlanToFullCustomer({
		fullCustomer: finalFullCustomer,
		pooledBalancePlan: autumnBillingPlan.pooledBalancePlan,
	});

	return finalFullCustomer;
};

export const autumnBillingPlanToFinalFullCustomer = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) =>
	applyAutumnBillingPlanToFullCustomer({
		fullCustomer: billingContext.fullCustomer,
		autumnBillingPlan,
	});
