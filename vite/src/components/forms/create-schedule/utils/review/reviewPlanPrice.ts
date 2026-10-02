import {
	type Feature,
	findFeatureById,
	getFeatureName,
	numberWithCommas,
	type SetPlansPreviewPlan,
} from "@autumn/shared";
import { PRICE_VARIES_LABEL } from "@/utils/product/basePriceDisplayUtils";
import { formatMoney } from "./formatMoney";
import { priceIntervalSuffix } from "./processorItemPriceLabels";
import type { ReviewChangeValue } from "./types/reviewChange";

type PlanPrice = SetPlansPreviewPlan["prices"][number];

const unitLabel = ({
	planPrice,
	features,
}: {
	planPrice: PlanPrice;
	features: Feature[];
}) => {
	const billingUnits = planPrice.price.units_per_quantity ?? 1;
	const feature = planPrice.feature_id
		? findFeatureById({ features, featureId: planPrice.feature_id })
		: undefined;
	const name =
		getFeatureName({ feature, units: billingUnits }).toLowerCase() ||
		(planPrice.feature_id ?? "");

	return billingUnits > 1 ? `${numberWithCommas(billingUnits)} ${name}` : name;
};

/** A plan with no base price shows its first feature's unit price, e.g. "From $10/seat +1"; a free allowance tier is skipped. */
const featureUnitPrice = ({
	featurePrices,
	features,
}: {
	featurePrices: PlanPrice[];
	features: Feature[];
}): ReviewChangeValue => {
	const [planPrice] = featurePrices;
	const amount =
		planPrice?.price.unit_amount ??
		planPrice?.price.tiers?.find((tier) => tier.unit_amount > 0)?.unit_amount;
	if (!planPrice || amount === null || amount === undefined) {
		return { amount: PRICE_VARIES_LABEL };
	}

	const otherPricedCount = featurePrices.length - 1;
	return {
		amount: `${planPrice.price.tiers_mode ? "From " : ""}${formatMoney({ amount, currency: planPrice.price.currency })}`,
		suffix: `/${unitLabel({ planPrice, features })}${otherPricedCount > 0 ? ` +${otherPricedCount}` : ""}`,
	};
};

export const reviewPlanPrice = ({
	prices,
	features,
}: {
	prices: PlanPrice[];
	features: Feature[];
}): ReviewChangeValue => {
	if (prices.length === 0) return { amount: "Free" };

	const basePrice = prices.find((planPrice) => !planPrice.feature_id)?.price;
	if (basePrice && basePrice.unit_amount !== null) {
		return {
			amount: formatMoney({
				amount: basePrice.unit_amount,
				currency: basePrice.currency,
			}),
			suffix: priceIntervalSuffix(basePrice),
		};
	}

	return featureUnitPrice({
		featurePrices: prices.filter((planPrice) => planPrice.feature_id),
		features,
	});
};
