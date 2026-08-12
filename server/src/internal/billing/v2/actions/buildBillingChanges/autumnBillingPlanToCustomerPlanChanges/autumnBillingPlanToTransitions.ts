import type {
	AutumnBillingPlan,
	CustomerProductUpdate,
	FullCusProduct,
	FullCustomer,
	PatchCustomerProductSchema,
} from "@autumn/shared";
import type { z } from "zod/v4";
import {
	type CustomerProductTransition,
	deriveCustomerPlanChangeAction,
} from "../buildCustomerPlanChanges/buildCustomerPlanChange";

type PatchCustomerProduct = z.infer<typeof PatchCustomerProductSchema>;

/** Materializes the post-update product for the lifecycle fields the kernel reads. */
const applyCustomerProductUpdate = ({
	customerProduct,
	updates,
}: CustomerProductUpdate): FullCusProduct => ({
	...customerProduct,
	...(updates.status !== undefined ? { status: updates.status } : {}),
	...(updates.canceled_at !== undefined
		? { canceled_at: updates.canceled_at }
		: {}),
	...(updates.ended_at !== undefined ? { ended_at: updates.ended_at } : {}),
	...(updates.trial_ends_at !== undefined
		? { trial_ends_at: updates.trial_ends_at }
		: {}),
});

/** Patch snapshots may not include the rows being deleted; `before` restores
 * them so the kernel's entitlement diff sees the true pre-patch state. */
const patchToTransition = (
	patch: PatchCustomerProduct,
): CustomerProductTransition => {
	const { customerProduct } = patch;
	const presentEntitlementIds = new Set(
		customerProduct.customer_entitlements.map(
			(customerEntitlement) => customerEntitlement.id,
		),
	);
	const presentPriceIds = new Set(
		customerProduct.customer_prices.map((customerPrice) => customerPrice.id),
	);
	const deletedEntitlementIds = new Set(
		patch.deleteCustomerEntitlements.map(
			(customerEntitlement) => customerEntitlement.id,
		),
	);
	const deletedPriceIds = new Set(
		patch.deleteCustomerPrices.map((customerPrice) => customerPrice.id),
	);

	const before: FullCusProduct = {
		...customerProduct,
		customer_entitlements: [
			...customerProduct.customer_entitlements,
			...patch.deleteCustomerEntitlements.filter(
				(customerEntitlement) =>
					presentEntitlementIds.has(customerEntitlement.id) === false,
			),
		],
		customer_prices: [
			...customerProduct.customer_prices,
			...patch.deleteCustomerPrices.filter(
				(customerPrice) => presentPriceIds.has(customerPrice.id) === false,
			),
		],
	};

	const after: FullCusProduct = {
		...customerProduct,
		customer_entitlements: [
			...customerProduct.customer_entitlements.filter(
				(customerEntitlement) =>
					deletedEntitlementIds.has(customerEntitlement.id) === false,
			),
			...patch.insertCustomerEntitlements,
		],
		customer_prices: [
			...customerProduct.customer_prices.filter(
				(customerPrice) => deletedPriceIds.has(customerPrice.id) === false,
			),
			...patch.insertCustomerPrices,
		],
	};

	return { before, after };
};

/** License-quantity updates surface as an `updated` change on the parent
 * product even though no lifecycle or item field visibly changes. */
const customerLicenseUpdatesToTransitions = ({
	autumnBillingPlan,
	originalFullCustomer,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer?: FullCustomer;
}): CustomerProductTransition[] => {
	const licenseParentById = new Map<string, FullCusProduct>();
	for (const customerProduct of originalFullCustomer?.customer_products ?? []) {
		for (const customerLicense of customerProduct.customer_licenses ?? []) {
			licenseParentById.set(customerLicense.id, customerProduct);
		}
	}

	return (autumnBillingPlan.customerLicenseUpdates ?? []).flatMap((update) => {
		if (update.paidQuantity === undefined || !update.customerLicenseId)
			return [];
		const customerProduct = licenseParentById.get(update.customerLicenseId);
		if (!customerProduct) return [];
		return [{ before: customerProduct, after: customerProduct }];
	});
};

/**
 * When a billing action updates a plan in-place, Autumn often inserts a new
 * customer product and expires the old one — both sharing the same plan_id.
 * Pair those so the kernel sees one old-product → new-product transition
 * instead of an expiry plus an activation.
 */
const pairSamePlanIdReplacements = (
	transitions: CustomerProductTransition[],
): CustomerProductTransition[] => {
	const prospectiveAction = (transition: CustomerProductTransition) =>
		transition.after === null
			? null
			: deriveCustomerPlanChangeAction({
					before: transition.before,
					after: transition.after,
				});

	const consumed = new Set<number>();
	const result: CustomerProductTransition[] = [];

	for (let i = 0; i < transitions.length; i++) {
		if (consumed.has(i)) continue;
		const transition = transitions[i];
		const action = prospectiveAction(transition);

		if (action !== "activated" && action !== "expired") {
			result.push(transition);
			continue;
		}

		const planId = transition.after?.product_id;
		const counterpartAction = action === "activated" ? "expired" : "activated";
		const pairIdx = transitions.findIndex((other, j) => {
			if (j === i || consumed.has(j)) return false;
			return (
				prospectiveAction(other) === counterpartAction &&
				other.after?.product_id === planId
			);
		});

		if (pairIdx < 0) {
			result.push(transition);
			continue;
		}

		consumed.add(i);
		consumed.add(pairIdx);
		const pair = transitions[pairIdx];
		const activated = action === "activated" ? transition : pair;
		const expired = action === "expired" ? transition : pair;

		// An "expired" transition always has a before (inserts can't expire).
		result.push({
			before: expired.before ?? expired.after,
			after: activated.after,
		});
	}

	return result;
};

export const autumnBillingPlanToTransitions = ({
	autumnBillingPlan,
	originalFullCustomer,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer?: FullCustomer;
}): CustomerProductTransition[] => {
	const inserts: CustomerProductTransition[] = (
		autumnBillingPlan.insertCustomerProducts ?? []
	).map((customerProduct) => ({ before: null, after: customerProduct }));

	const updates: CustomerProductTransition[] = [
		...(autumnBillingPlan.updateCustomerProduct
			? [autumnBillingPlan.updateCustomerProduct]
			: []),
		...(autumnBillingPlan.updateCustomerProducts ?? []),
	].map((update) => ({
		before: update.customerProduct,
		after: applyCustomerProductUpdate(update),
	}));

	const patches = (autumnBillingPlan.patchCustomerProducts ?? []).map(
		patchToTransition,
	);

	const licenseTouches = customerLicenseUpdatesToTransitions({
		autumnBillingPlan,
		originalFullCustomer,
	});

	return pairSamePlanIdReplacements([
		...inserts,
		...updates,
		...patches,
		...licenseTouches,
	]);
};
