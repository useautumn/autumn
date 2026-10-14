import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import {
	cusProductToProduct,
	ErrCode,
	findPrepaidQuantityTargetPrice,
	isCustomerProductOneOff,
	isCustomerProductPaidRecurring,
	isOneOffPrice,
	productsAreSame,
	RecaseError,
	resolveFreeTrialParam,
	roundUsageToNearestBillingUnit,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { cusProductToPrices } from "@shared/utils/cusProductUtils/convertCusProduct";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

const blockOneOffQuantityChangeOutsideManualTopUp = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}) => {
	const { customerProduct } = billingContext;
	const featureQuantities = params.feature_quantities ?? [];
	if (featureQuantities.length === 0) return;

	for (const fq of featureQuantities) {
		const targetPrice = findPrepaidQuantityTargetPrice({
			prices: customerProduct.customer_prices.map((cp) => cp.price),
			featureId: fq.feature_id,
		});
		if (!targetPrice || !isOneOffPrice(targetPrice)) continue;
		const oneOffPrepaidPrice = targetPrice;

		const currentOption = customerProduct.options.find(
			(o) => o.feature_id === fq.feature_id,
		);
		if (!currentOption) continue;

		const matchingCusEnt = customerProduct.customer_entitlements.find(
			(ce) => ce.entitlement.feature.id === fq.feature_id,
		);
		const allowance = matchingCusEnt?.entitlement.allowance ?? 0;
		const billingUnits =
			(oneOffPrepaidPrice.config as { billing_units?: number }).billing_units ??
			1;

		const requestedUnits = fq.quantity ?? 0;
		const unitsExcludingAllowance = Math.max(
			0,
			new Decimal(requestedUnits).sub(allowance).toNumber(),
		);
		const roundedUnits = roundUsageToNearestBillingUnit({
			usage: unitsExcludingAllowance,
			billingUnits,
		});
		const requestedPacks = new Decimal(roundedUnits)
			.div(billingUnits)
			.toNumber();

		const currentPacks = currentOption.quantity ?? 0;
		if (!new Decimal(requestedPacks).eq(currentPacks)) {
			throw new RecaseError({
				message: COMPLEX_UPDATE_ERROR,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};

export const handleOneOffErrors = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	params: UpdateSubscriptionV1Params;
}) => {
	const { customerProduct } = billingContext;

	if (billingContext.intent === UpdateSubscriptionIntent.ManualTopUp) return;

	if (billingContext.intent !== UpdateSubscriptionIntent.UpdatePlan) {
		blockOneOffQuantityChangeOutsideManualTopUp({ billingContext, params });
	}

	if (!isCustomerProductOneOff(customerProduct)) return;

	const freeTrial = resolveFreeTrialParam(params);

	if (freeTrial) {
		throw new RecaseError({
			message: "Free trials are not available for one-off products",
			statusCode: 400,
		});
	}

	const newCustomerProduct = autumnBillingPlan.insertCustomerProducts?.[0];
	if (!newCustomerProduct) return;

	const currentFullProduct = cusProductToProduct({
		cusProduct: customerProduct,
	});

	const newFullProduct = cusProductToProduct({
		cusProduct: newCustomerProduct,
	});

	const { onlyEntsChanged } = productsAreSame({
		curProductV1: currentFullProduct,
		newProductV1: newFullProduct,
		features: ctx.features,
	});

	if (!onlyEntsChanged) {
		throw new RecaseError({
			message:
				"For one-off products, only entitlement changes are allowed; price and billing changes are not supported",
			statusCode: 400,
		});
	}
};

export const checkTrialRemovalWithOneOffItems = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const isPaidRecurring = isCustomerProductPaidRecurring(
		billingContext.customerProduct,
	);

	if (!isPaidRecurring) return;

	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	if (!isTrialing || willBeTrialing) return;

	const newCustomerProducts = autumnBillingPlan.insertCustomerProducts;
	const newPrices = newCustomerProducts.flatMap((customerProduct) =>
		cusProductToPrices({ cusProduct: customerProduct }),
	);
	const newHasOneOffPrices = newPrices.some(isOneOffPrice);

	if (newHasOneOffPrices) {
		throw new RecaseError({
			message:
				"Cannot remove the free trial while adding one-off items to a paid recurring subscription",
			statusCode: 400,
		});
	}
};

export const COMPLEX_UPDATE_ERROR =
	"Cannot update a one-off prepaid quantity alongside other subscription changes. Update the plan first, then adjust the quantity separately.";
