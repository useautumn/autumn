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

/** Compute the auto top-up billing plan + stripe invoice action. Returns null if line item amount is <= 0. */
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

	// C. Build autumn billing plan
	const autumnBillingPlan: AutumnBillingPlan = {
		customerId: autoTopupContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		lineItems: [lineItem],
		updateCustomerEntitlements: [
			{
				customerEntitlement,
				balanceChange: quantity,
			},
		],
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
