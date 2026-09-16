import {
	type AutumnBillingPlan,
	billingContextToCurrency,
	cusEntToCusPrice,
	cusProductToPrices,
	type FullCusEntWithFullCusProduct,
	findPrepaidQuantityTargetPrice,
	fullCustomerToCustomerEntitlements,
	InternalError,
	isOneOffPrice,
	type LineItem,
	type LineItemContext,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeRebalancedAutoTopUp } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp.js";
import { topUpQuantityToLineItem } from "@/internal/balances/autoTopUp/compute/topUpQuantityToLineItem.js";
import { buildUpdatedOptions } from "@/internal/balances/autoTopUp/helpers/autoTopUpUtils.js";
import { entitlementToExpiry } from "@/internal/billing/v2/utils/expiringGrants/entitlementExpiry.js";
import { assertRoomForExpiringGrants } from "@/internal/billing/v2/utils/expiringGrants/hasRoomForExpiringGrant.js";
import { routeRemainderToExpiringGrant } from "@/internal/billing/v2/utils/expiringGrants/routeRemainderToExpiringGrant.js";

/** Charge the same one-off prepaid price the ManualTopUp intent was routed on. */
const findTargetCusEnt = ({
	billingContext,
	featureId,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	featureId: string;
}): FullCusEntWithFullCusProduct | undefined => {
	const { fullCustomer, customerProduct } = billingContext;

	const targetPrice = findPrepaidQuantityTargetPrice({
		prices: cusProductToPrices({ cusProduct: customerProduct }),
		featureId,
	});
	if (!targetPrice || !isOneOffPrice(targetPrice)) return undefined;

	const cusEntsForFeature = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	return cusEntsForFeature.find(
		(ce) =>
			ce.customer_product?.id === customerProduct.id &&
			cusEntToCusPrice({ cusEnt: ce })?.price.id === targetPrice.id,
	);
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
		const lineItem = topUpQuantityToLineItem({
			cusEnt: prepaidCusEnt,
			quantity,
			context: {
				price: cusPrice.price,
				product: customerProduct.product,
				feature,
				currency: billingContextToCurrency({ org, billingContext }),
				direction: "charge",
				now: currentEpochMs ?? Date.now(),
				billingTiming: "in_advance",
			} satisfies LineItemContext,
		});

		lineItems = [lineItem];
	}

	const rebalance = computeRebalancedAutoTopUp({
		fullCustomer,
		featureId,
		quantity,
		prepaidCustomerEntitlementId: prepaidCusEnt.id,
	});

	const hasExpiry = Boolean(
		entitlementToExpiry({ entitlement: prepaidCusEnt.entitlement }),
	);
	if (hasExpiry) {
		assertRoomForExpiringGrants({
			fullCustomer,
			incoming: 1,
			now: currentEpochMs ?? Date.now(),
		});
	}

	const { deltas, customEntitlements, insertCustomerEntitlements } =
		routeRemainderToExpiringGrant({
			deltas: rebalance.deltas,
			customerEntitlement: prepaidCusEnt,
			source: "manual_topup",
			orgId: org.id,
			now: currentEpochMs ?? Date.now(),
		});

	return {
		customerId: fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		lineItems,
		updateCustomerEntitlements: [],
		autoTopupRebalance: { deltas },
		...(customEntitlements.length ? { customEntitlements } : {}),
		...(insertCustomerEntitlements.length
			? { insertCustomerEntitlements }
			: {}),
		...(hasExpiry
			? {}
			: {
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
				}),
	};
};
