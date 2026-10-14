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
import { fetchStoredLineItemsForBilling } from "@/internal/billing/v2/setup/fetchStoredLineItemsForBilling.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { applyDeductionUpdateToCustomerEntitlement } from "../deduction/applyDeductionUpdateToCustomerEntitlement.js";
import { applyDeductionUpdateToFullCustomer } from "../deduction/applyDeductionUpdateToFullCustomer.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { AllocatedInvoiceContext } from "./allocatedInvoiceContext.js";

export const setupAllocatedInvoiceContext = async ({
	ctx,
	oldFullCustomer,
	customerEntitlement,
	update,
	deductionPersisted = true,
}: {
	ctx: AutumnContext;
	oldFullCustomer: FullCustomer;
	customerEntitlement: FullCusEntWithFullCusProduct;
	update: DeductionUpdate;
	deductionPersisted?: boolean;
}): Promise<AllocatedInvoiceContext | null> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: {
			customer_id: oldFullCustomer.id ?? oldFullCustomer.internal_id,
			entity_id: oldFullCustomer.entity?.id ?? undefined,
		},
	});

	if (deductionPersisted) {
		applyDeductionUpdateToFullCustomer({
			fullCus: fullCustomer,
			cusEntId: customerEntitlement.id,
			update,
		});
	}

	const { logger } = ctx;

	const cusProduct = customerEntitlement.customer_product;

	if (!cusProduct) {
		logger.error("setupAllocatedInvoiceContext: no customer product found");
		return null;
	}

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

	const { storedChargeLineItems, storedRefundLineItems } =
		await fetchStoredLineItemsForBilling({
			db: ctx.db,
			customerProductIds: [cusProduct.id],
		});

	return {
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
		storedChargeLineItems,
		storedRefundLineItems,
		paymentMethod,
		billingVersion: BillingVersion.V2,

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
