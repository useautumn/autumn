import {
	BillingVersion,
	cusEntToCusPrice,
	cusEntToInvoiceOverage,
	cusEntToInvoiceUsage,
	cusProductToProduct,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	secondsToMs,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { applyDeductionUpdateToCustomerEntitlement } from "../deduction/applyDeductionUpdateToCustomerEntitlement.js";
import { applyDeductionUpdateToFullCustomer } from "../deduction/applyDeductionUpdateToFullCustomer.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { AllocatedInvoiceContext } from "./allocatedInvoiceContext.js";

/**
 * Gathers all state needed for the allocated invoice flow.
 * Returns null if the flow should be skipped (no subscription / no sub item).
 */
export const setupAllocatedInvoiceContext = async ({
	ctx,
	oldFullCustomer,
	customerEntitlement,
	update,
}: {
	ctx: AutumnContext;
	oldFullCustomer: FullCustomer;
	customerEntitlement: FullCusEntWithFullCusProduct;
	update: DeductionUpdate;
}): Promise<AllocatedInvoiceContext | null> => {
	// Fetch full customer again just in case...
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: {
			customer_id: oldFullCustomer.id ?? oldFullCustomer.internal_id,
			entity_id: oldFullCustomer.entity?.id,
		},
	});

	// Need to have the "latest" full customer so that when we apply the new updates, the state is correct, and stripe subscription state is correct too.
	applyDeductionUpdateToFullCustomer({
		fullCus: fullCustomer,
		cusEntId: customerEntitlement.id,
		update,
	});

	const { logger } = ctx;

	const cusProduct = customerEntitlement.customer_product;

	if (!cusProduct) {
		logger.error("setupAllocatedInvoiceContext: no customer product found");
		return null;
	}

	// Fetch Stripe context (subscription, customer, discounts, payment method)
	const {
		stripeSubscription,
		stripeSubscriptionSchedule,
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
		fullProducts: [cusProductToProduct({ cusProduct })],
		featureQuantities: [],
		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs: billingCycleAnchorMs,
		stripeCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeDiscounts,
		paymentMethod,
		billingVersion: BillingVersion.V2,

		// Allocated invoice specific fields
		customerEntitlement,
		updatedCustomerEntitlement: applyDeductionUpdateToCustomerEntitlement({
			customerEntitlement,
			update,
		}),
		update,

		previousUsage,
		newUsage,
		previousOverage,
		newOverage,
	};
};
