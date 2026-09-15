import type {
	CarryOverUsages,
	CustomerLicenseBillingContext,
	CustomerLicenseTransition,
	FullCusProduct,
} from "@autumn/shared";
import { computeProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import { pairCustomerProducts } from "../pairCustomerProducts.js";
import { applyCustomerLicenseTransitions } from "./applyCustomerLicenseTransitions.js";
import { customerLicensePairToTransition } from "./customerLicensePairToTransition.js";
import { isSameRowTransition } from "./isSameRowTransition.js";
import { pairCustomerLicensesByLicensePlan } from "./pairCustomerLicensesByLicensePlan.js";

/** Drops successors already converged by content; parent version bumps still transition.
 * Same-row patches diff against the pristine outgoing row: the incoming copy is
 * already converged, so comparing to it would hide every in-place resize. */
const isNoopTransition = (transition: CustomerLicenseTransition): boolean => {
	const { incomingCustomerLicense, outgoingCustomerLicense, updates } =
		transition;
	const baseline = isSameRowTransition(transition)
		? outgoingCustomerLicense
		: incomingCustomerLicense;
	const fromProduct = transition.outgoingCustomerLicense.planLicense?.product;
	const toProduct = transition.incomingCustomerLicense.planLicense?.product;
	const productTransitions =
		fromProduct && toProduct
			? computeProductTransitions({ fromProduct, toProduct })
			: undefined;
	const entitlementPriceTransitions = productTransitions?.entitlementPrices;
	const hasEntitlementChanges = Boolean(
		entitlementPriceTransitions &&
			(entitlementPriceTransitions.transitions.length > 0 ||
				entitlementPriceTransitions.added.length > 0 ||
				entitlementPriceTransitions.deleted.length > 0),
	);
	return (
		!productTransitions?.basePrice &&
		!productTransitions?.customerProduct &&
		!hasEntitlementChanges &&
		updates.linkId === incomingCustomerLicense.link_id &&
		updates.granted === baseline.granted &&
		updates.remaining === baseline.remaining &&
		updates.paidQuantity === baseline.paid_quantity &&
		incomingCustomerLicense.plan_license_id === baseline.plan_license_id
	);
};

/** Computes license transitions across customer products.
 * Carrying pool state is independent from billing projection. */
export const computeCustomerLicenseTransitions = ({
	outgoingCustomerProducts,
	incomingCustomerProducts,
	customerLicenseBillingContext,
	carryCustomerLicenseState = true,
	carryOverUsages,
}: {
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
	customerLicenseBillingContext?: CustomerLicenseBillingContext;
	carryCustomerLicenseState?: boolean;
	carryOverUsages?: CarryOverUsages;
}): CustomerLicenseTransition[] => {
	const customerLicenseTransitions: CustomerLicenseTransition[] = [];

	const customerProductPairs = pairCustomerProducts({
		outgoingCustomerProducts,
		incomingCustomerProducts,
	});

	for (const {
		outgoingCustomerProduct,
		incomingCustomerProduct,
	} of customerProductPairs) {
		const customerLicensePairs = pairCustomerLicensesByLicensePlan({
			outgoingCustomerProduct,
			incomingCustomerProduct,
		});

		for (const customerLicensePair of customerLicensePairs) {
			const transition = customerLicensePairToTransition(customerLicensePair);
			if (isNoopTransition(transition)) continue;

			customerLicenseTransitions.push({
				...transition,
				carryOverUsages,
				billingCycleAnchorMs:
					incomingCustomerProduct.billing_cycle_anchor ??
					outgoingCustomerProduct.billing_cycle_anchor ??
					undefined,
			});
		}
	}

	// Billing always projects; live pool state carries only when requested.
	applyCustomerLicenseTransitions({
		customerProductsToMutate: carryCustomerLicenseState
			? incomingCustomerProducts
			: [],
		customerLicenseTransitions,
		customerLicenseBillingContext,
	});

	return customerLicenseTransitions;
};
