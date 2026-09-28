import {
	type AutumnBillingPlan,
	billingContextToCurrency,
	cusEntToCusPrice,
	cusProductToPrices,
	InternalError,
	isLosingPrepaidQuantityPrice,
	type LineItemContext,
	type StripeBillingPlan,
	type StripeInvoiceAction,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams.js";
import { entitlementToExpiry } from "@/internal/billing/v2/utils/expiringGrants/entitlementExpiry.js";
import { routeRemainderToExpiringGrant } from "@/internal/billing/v2/utils/expiringGrants/routeRemainderToExpiringGrant.js";
import type { AutoTopupContext } from "../autoTopupContext.js";
import { buildUpdatedOptions } from "../helpers/autoTopUpUtils.js";
import { computeRebalancedAutoTopUp } from "./computeRebalancedAutoTopUp.js";
import { topUpQuantityToLineItem } from "./topUpQuantityToLineItem.js";

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
	// Expiring items are recorded on their own loose grant, and a one-off price
	// that loses the prepaid tie-break does not own the feature-keyed quantity.
	const hasExpiry = Boolean(
		entitlementToExpiry({ entitlement: customerEntitlement.entitlement }),
	);
	const ownsFeatureQuantity = !isLosingPrepaidQuantityPrice({
		price: cusPrice.price,
		prices: cusProductToPrices({ cusProduct }),
	});
	const updateCustomerProduct =
		hasExpiry || !ownsFeatureQuantity
			? undefined
			: {
					customerProduct: cusProduct,
					updates: {
						options: buildUpdatedOptions({ cusProduct, feature, topUpPacks }),
					},
				};

	// B. Build line item
	const lineItemContext = {
		price: cusPrice.price,
		product: cusProduct.product,
		feature,
		currency: billingContextToCurrency({
			org,
			billingContext: autoTopupContext,
		}),
		direction: "charge",
		now: Date.now(),
		billingTiming: "in_advance",
	} satisfies LineItemContext;

	const lineItem = topUpQuantityToLineItem({
		cusEnt: customerEntitlement,
		quantity,
		context: lineItemContext,
	});

	if (lineItem.amount <= 0) {
		throw new InternalError({
			message: `[computeAutoTopupPlan] Calculated amount for auto top-up is ${lineItem.amount} for feature ${feature.id}, skipping`,
		});
	}

	// C. Compute paydown + prepaid remainder deltas from the context's FullCustomer.
	// Deltas apply atomically at execute time via `balance + delta` SQL increments.
	const rebalance = computeRebalancedAutoTopUp({
		fullCustomer: autoTopupContext.fullCustomer,
		featureId: feature.id,
		quantity,
		prepaidCustomerEntitlementId: customerEntitlement.id,
	});

	const { deltas, customEntitlements, insertCustomerEntitlements } =
		routeRemainderToExpiringGrant({
			deltas: rebalance.deltas,
			customerEntitlement,
			source: "auto_topup",
			orgId: org.id,
			now: Date.now(),
		});

	// D. Build autumn billing plan. `options.quantity` bumps by the FULL topUpPacks
	// because the customer is charged for the full purchase regardless of where the
	// balance landed.
	const autumnBillingPlan: AutumnBillingPlan = {
		customerId: autoTopupContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		lineItems: [lineItem],
		updateCustomerEntitlements: [],
		autoTopupRebalance: { deltas },
		...(customEntitlements.length ? { customEntitlements } : {}),
		...(insertCustomerEntitlements.length
			? { insertCustomerEntitlements }
			: {}),
		...(updateCustomerProduct ? { updateCustomerProduct } : {}),
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
