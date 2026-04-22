import {
	type AutumnBillingPlan,
	cusEntToCusPrice,
	InternalError,
	type LineItemContext,
	orgToCurrency,
	type StripeBillingPlan,
	type StripeInvoiceAction,
	type UsagePriceConfig,
	usagePriceToLineItem,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams.js";
import type { AutoTopupContext } from "../autoTopupContext.js";
import {
	buildUpdatedOptions,
	updateCusEntOptionsInline,
} from "../helpers/autoTopUpUtils.js";

/** Compute the auto top-up billing plan + stripe invoice action. Throws if line item amount is <= 0. */
export const computeAutoTopupPlan = ({
	ctx,
	autoTopupContext,
}: {
	ctx: AutumnContext;
	autoTopupContext: AutoTopupContext;
}): {
	autumnBillingPlan: AutumnBillingPlan;
	stripeBillingPlan: StripeBillingPlan;
} => {
	const { org } = ctx;
	const { autoTopupConfig, customerEntitlement } = autoTopupContext;

	const cusProduct = customerEntitlement.customer_product!;
	const feature = customerEntitlement.entitlement.feature;
	const cusPrice = cusEntToCusPrice({ cusEnt: customerEntitlement })!;
	const quantity = autoTopupConfig.quantity;

	// A. Convert credits to packs (billing units)
	const priceConfig = cusPrice.price.config as UsagePriceConfig;
	const billingUnits = priceConfig.billing_units || 1;
	const topUpPacks = new Decimal(quantity).div(billingUnits).toNumber();

	const inlineCusEnt = updateCusEntOptionsInline({
		cusEnt: customerEntitlement,
		feature,
		quantity: topUpPacks,
	});

	// B. Build line item
	const lineItem = usagePriceToLineItem({
		cusEnt: inlineCusEnt,
		context: {
			price: cusPrice.price,
			product: cusProduct.product,
			feature,
			currency: orgToCurrency({ org }),
			direction: "charge",
			now: Date.now(),
			billingTiming: "in_advance",
		} satisfies LineItemContext,
		options: {
			shouldProrateOverride: false,
			chargeImmediatelyOverride: true,
		},
	});

	if (lineItem.amount <= 0) {
		throw new InternalError({
			message: `[computeAutoTopupPlan] Calculated amount for auto top-up is ${lineItem.amount} for feature ${feature.id}, skipping`,
		});
	}

	// C. Build autumn billing plan.
	//
	// Balance mutations (paydown overage + prepaid remainder) are NOT emitted as
	// synchronous updateCustomerEntitlements entries. Instead we emit a declarative
	// `autoTopupRebalance` intent; the executor reads LIVE cusEnt balances at
	// post-Stripe time and computes exact paydown/remainder deltas against the live
	// state. That avoids two races inherent to snapshot-based paydown:
	//   - Concurrent usage between setup snapshot and exec being overwritten (data loss).
	//   - Concurrent refunds making the snapshot's overage look deeper than it actually
	//     is (would produce silent overcredit).
	//
	// `options.quantity` still bumps by the FULL topUpPacks here — the customer was
	// charged for the full quantity, so the purchase ledger should record the full
	// purchase regardless of where the balance landed.
	const autumnBillingPlan: AutumnBillingPlan = {
		customerId: autoTopupContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		lineItems: [lineItem],
		updateCustomerEntitlements: [],
		autoTopupRebalance: {
			featureId: feature.id,
			quantity,
			prepaidCustomerEntitlementId: customerEntitlement.id,
		},
		updateCustomerProduct: {
			customerProduct: cusProduct,
			updates: {
				options: buildUpdatedOptions({ cusProduct, feature, topUpPacks }),
			},
		},
	};

	// D. Build stripe invoice action (manual — bypassing evaluateStripeBillingPlan)
	const addLineParams = lineItemsToInvoiceAddLinesParams({
		lineItems: [lineItem],
	});

	const stripeInvoiceAction: StripeInvoiceAction = {
		addLineParams: { lines: addLineParams },
	};

	return {
		autumnBillingPlan,
		stripeBillingPlan: { invoiceAction: stripeInvoiceAction },
	};
};
