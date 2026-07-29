import {
	type AutumnBillingPlan,
	billingContextToCurrency,
	cusEntToCusPrice,
	type FullCusEntWithFullCusProduct,
	fullCustomerToCustomerEntitlements,
	InternalError,
	isOneOffPrice,
	isPrepaidPrice,
	isVolumeBasedCusEnt,
	type LineItem,
	type LineItemContext,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
	type UsagePriceConfig,
	usagePriceToLineItem,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeRebalancedAutoTopUp } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp.js";
import {
	buildUpdatedOptions,
	updateCusEntOptionsInline,
} from "@/internal/balances/autoTopUp/helpers/autoTopUpUtils.js";

const findTargetCusEnt = ({
	billingContext,
	featureId,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	featureId: string;
}): FullCusEntWithFullCusProduct | undefined => {
	const { fullCustomer, customerProduct } = billingContext;

	const cusEntsForFeature = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	return cusEntsForFeature.find((ce) => {
		if (ce.customer_product?.id !== customerProduct.id) return false;
		const cusPrice = cusEntToCusPrice({ cusEnt: ce });
		if (!cusPrice) return false;
		return (
			isOneOffPrice(cusPrice.price) &&
			isPrepaidPrice(cusPrice.price) &&
			!isVolumeBasedCusEnt(ce)
		);
	});
};

/** Build the AutumnBillingPlan for a manual top-up: invoice charge (unless
 * skipBillingChanges), paydown + remainder deltas, and an options.quantity bump. */
export const computeManualTopUpPlan = ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}): AutumnBillingPlan => {
	const { org } = ctx;
	const { customerProduct, fullCustomer, currentEpochMs, skipBillingChanges } =
		billingContext;

	const featureQuantityParam = params.feature_quantities?.[0];
	if (!featureQuantityParam) {
		throw new InternalError({
			message:
				"[computeManualTopUpPlan] expected exactly one feature_quantities entry",
		});
	}

	const { feature_id: featureId, quantity: rawQuantity } = featureQuantityParam;
	const quantity = rawQuantity ?? 0;

	const prepaidCusEnt = findTargetCusEnt({ billingContext, featureId });
	if (!prepaidCusEnt) {
		throw new InternalError({
			message: `[computeManualTopUpPlan] one-off prepaid cusEnt not found for feature ${featureId}`,
		});
	}

	const cusPrice = cusEntToCusPrice({
		cusEnt: prepaidCusEnt,
		errorOnNotFound: true,
	});
	const feature = prepaidCusEnt.entitlement.feature;
	const priceConfig = cusPrice.price.config as UsagePriceConfig;
	const billingUnits = priceConfig.billing_units || 1;
	const topUpPacks = new Decimal(quantity).div(billingUnits).toNumber();

	let lineItems: LineItem[] = [];
	if (!skipBillingChanges) {
		const inlineCusEnt = updateCusEntOptionsInline({
			cusEnt: prepaidCusEnt,
			feature,
			quantity: topUpPacks,
		});

		const lineItem = usagePriceToLineItem({
			cusEnt: inlineCusEnt,
			context: {
				price: cusPrice.price,
				product: customerProduct.product,
				feature,
				currency: billingContextToCurrency({ org, billingContext }),
				direction: "charge",
				now: currentEpochMs ?? Date.now(),
				billingTiming: "in_advance",
			} satisfies LineItemContext,
			options: {
				shouldProrateOverride: false,
				chargeImmediatelyOverride: true,
			},
		});

		lineItems = [lineItem];
	}

	const { deltas } = computeRebalancedAutoTopUp({
		fullCustomer,
		featureId,
		quantity,
		prepaidCustomerEntitlementId: prepaidCusEnt.id,
	});

	return {
		customerId: fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		lineItems,
		updateCustomerEntitlements: [],
		autoTopupRebalance: { deltas },
		updateCustomerProduct: {
			customerProduct,
			updates: {
				options: buildUpdatedOptions({
					cusProduct: customerProduct,
					feature,
					topUpPacks,
				}),
			},
		},
	};
};
