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

	const priceConfig = cusPrice.price.config as UsagePriceConfig;
	const billingUnits = priceConfig.billing_units || 1;
	const topUpPacks = new Decimal(quantity).div(billingUnits).toNumber();
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

	const rebalance = computeRebalancedAutoTopUp({
		fullCustomer: autoTopupContext.fullCustomer,
		featureId: feature.id,
		quantity,
		prepaidCustomerEntitlementId: customerEntitlement.id,
	});

	const {
		deltas,
		customEntitlements,
		insertCustomerEntitlements,
		creditedCustomerEntitlementId,
	} = routeRemainderToExpiringGrant({
		deltas: rebalance.deltas,
		customerEntitlement,
		source: "auto_topup",
		orgId: org.id,
		now: Date.now(),
	});

	const autumnBillingPlan: AutumnBillingPlan = {
		customerId: autoTopupContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		lineItems: [lineItem],
		updateCustomerEntitlements: [],
		autoTopupRebalance: {
			deltas,
			customerEntitlementId: customerEntitlement.id,
			featureId: feature.id,
			quantity,
			creditedCustomerEntitlementId,
		},
		...(customEntitlements.length ? { customEntitlements } : {}),
		...(insertCustomerEntitlements.length
			? { insertCustomerEntitlements }
			: {}),
		...(updateCustomerProduct ? { updateCustomerProduct } : {}),
	};

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
