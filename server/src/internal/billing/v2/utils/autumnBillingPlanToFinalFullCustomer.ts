import type {
	AutumnBillingPlan,
	BillingContext,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import { isSameRowTransition } from "@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition";
import { applyPooledBalancePlanToFullCustomer } from "@/internal/billing/v2/utils/billingPlan/applyPooledBalancePlanToFullCustomer";
import {
	applyCustomerProductPatch,
	applyCustomerProductUpdate,
	getDeleteCustomerProducts,
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { convergeCustomerLicense } from "@/internal/billing/v2/utils/convergeCustomerLicense";

/** In-memory twin of the pool-converging executors: absolute paidQuantity
 * updates and same-row transitions (take/release moves never reach a
 * Stripe evaluate; cross-row successors ride their inserted rows). */
const applyCustomerLicensePlanOps = ({
	customerProducts,
	autumnBillingPlan,
}: {
	customerProducts: FullCusProduct[];
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const paidQuantityUpdates = (
		autumnBillingPlan.customerLicenseUpdates ?? []
	).filter((update) => update.paidQuantity !== undefined);
	const sameRowTransitions = (
		autumnBillingPlan.customerLicenseTransitions ?? []
	).filter(isSameRowTransition);
	if (paidQuantityUpdates.length === 0 && sameRowTransitions.length === 0)
		return;

	for (const customerProduct of customerProducts) {
		customerProduct.customer_licenses = customerProduct.customer_licenses?.map(
			(customerLicense) => {
				const update = paidQuantityUpdates.find(
					(candidate) => candidate.customerLicenseId === customerLicense.id,
				);
				if (update?.paidQuantity !== undefined) {
					return convergeCustomerLicense({
						customerLicense,
						paidQuantity: update.paidQuantity,
					});
				}

				const transition = sameRowTransitions.find(
					(candidate) =>
						candidate.incomingCustomerLicense.id === customerLicense.id,
				);
				const planLicense = transition?.incomingCustomerLicense.planLicense;
				if (!transition || !planLicense) return customerLicense;
				return convergeCustomerLicense({
					customerLicense,
					planLicense,
					paidQuantity: transition.updates.paidQuantity,
				});
			},
		);
	}
};

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

	// 1. Combine existing customer products with new ones
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

	// 3. Remove deleted customer product if applicable
	if (deleteCustomerProducts.length > 0) {
		const deletedIds = new Set(
			deleteCustomerProducts.map((customerProduct) => customerProduct.id),
		);
		customerProducts = customerProducts.filter(
			(customerProduct) => !deletedIds.has(customerProduct.id),
		);
	}

	// 4. Apply entitlement balance updates
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

	// 5. Converge pool counters for absolute paid-quantity moves so downstream
	// projections (Stripe item quantities, line items) see the after state.
	applyCustomerLicensePlanOps({
		customerProducts,
		autumnBillingPlan,
	});
	finalFullCustomer.customer_products = customerProducts;
	applyPooledBalancePlanToFullCustomer({
		fullCustomer: finalFullCustomer,
		pooledBalancePlan: autumnBillingPlan.pooledBalancePlan,
	});

	// 6. Return final full customer. Customer licenses otherwise need no merge
	// — they ride each customer product (hydration-stitched or init-planned).
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
