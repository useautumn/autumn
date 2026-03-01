import {
	BillingVersion,
	cusEntToCusPrice,
	cusEntToInvoiceOverage,
	cusEntToInvoiceUsage,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	secondsToMs,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext.js";
import { applyDeductionUpdateToCustomerEntitlement } from "../deduction/applyDeductionUpdateToCustomerEntitlement.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { AllocatedInvoiceContext } from "./allocatedInvoiceContext.js";

/**
 * Gathers all state needed for the allocated invoice flow.
 * Returns null if the flow should be skipped (no subscription / no sub item).
 */
export const setupAllocatedInvoiceContext = async ({
	ctx,
	customerEntitlement,
	fullCustomer,
	update,
}: {
	ctx: AutumnContext;
	customerEntitlement: FullCusEntWithFullCusProduct;
	fullCustomer: FullCustomer;
	update: DeductionUpdate;
}): Promise<AllocatedInvoiceContext | null> => {
	const { logger } = ctx;

	const cusProduct = customerEntitlement.customer_product;

	if (!cusProduct) {
		logger.error("setupAllocatedInvoiceContext: no customer product found");
		return null;
	}

	// Fetch Stripe context (subscription, customer, discounts, payment method)
	const {
		stripeSubscription,
		stripeCustomer,
		stripeDiscounts,
		paymentMethod,
		testClockFrozenTime,
	} = await setupStripeBillingContext({
		ctx,
		fullCustomer,
		targetCustomerProduct: cusProduct,
	});

	if (!stripeSubscription) {
		logger.error("setupAllocatedInvoiceContext: no subscription found");
		return null;
	}

	// Find the subscription item for this price
	const cusPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });

	if (!cusPrice) {
		logger.error("setupAllocatedInvoiceContext: no customer price found");
		return null;
	}

	const currentEpochMs = testClockFrozenTime ?? Date.now();
	const billingCycleAnchorMs =
		secondsToMs(stripeSubscription.billing_cycle_anchor) ?? currentEpochMs;

	const newCustomerEntitlement = applyDeductionUpdateToCustomerEntitlement({
		customerEntitlement,
		update,
	});

	const previousUsage = cusEntToInvoiceUsage({
		cusEnt: customerEntitlement,
	});

	const newUsage = cusEntToInvoiceUsage({
		cusEnt: newCustomerEntitlement,
	});

	const previousOverage = cusEntToInvoiceOverage({
		cusEnt: customerEntitlement,
	});

	const newOverage = cusEntToInvoiceOverage({
		cusEnt: newCustomerEntitlement,
	});

	return {
		// BillingContext fields
		fullCustomer,
		fullProducts: [],
		featureQuantities: [],
		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs: billingCycleAnchorMs,
		stripeCustomer,
		stripeSubscription,
		stripeDiscounts,
		paymentMethod,
		billingVersion: BillingVersion.V2,

		// Allocated invoice specific fields
		customerEntitlement,
		update,

		previousUsage,
		newUsage,
		previousOverage,
		newOverage,
	};
};
