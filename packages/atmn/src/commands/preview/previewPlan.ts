import {
	BillingInterval,
	BillingMethod,
	getPlanDisplay,
	ResetInterval,
	TierBehavior,
	type CreatePlanItemParamsV1Input,
	type CreatePlanParamsV2Input,
	type PlanItemDisplayFeature,
} from "@autumn/shared";
import type { Feature, FreeTrial, Plan, PlanItem } from "../../compose/index.js";

export interface PlanFeatureDisplay {
	primary_text: string;
	secondary_text?: string;
	tier_details?: string[];
}

export interface PlanPreview {
	name: string;
	basePrice?: string;
	freeTrial?: string;
	features: PlanFeatureDisplay[];
}

type AtmnPlanItemPrice = NonNullable<PlanItem["price"]>;
type AtmnPlanPrice = NonNullable<Plan["price"]>;

const toBillingMethod = (method: AtmnPlanItemPrice["billingMethod"]) => {
	switch (method) {
		case "prepaid":
			return BillingMethod.Prepaid;
		case "usage_based":
			return BillingMethod.UsageBased;
	}
};

const toBillingInterval = (
	interval: NonNullable<AtmnPlanItemPrice["interval"]> | AtmnPlanPrice["interval"],
) => {
	switch (interval) {
		case "one_off":
			return BillingInterval.OneOff;
		case "week":
			return BillingInterval.Week;
		case "month":
			return BillingInterval.Month;
		case "quarter":
			return BillingInterval.Quarter;
		case "semi_annual":
			return BillingInterval.SemiAnnual;
		case "year":
			return BillingInterval.Year;
	}
};

const toResetInterval = (interval: NonNullable<PlanItem["reset"]>["interval"]) => {
	switch (interval) {
		case "one_off":
			return ResetInterval.OneOff;
		case "minute":
			return ResetInterval.Minute;
		case "hour":
			return ResetInterval.Hour;
		case "day":
			return ResetInterval.Day;
		case "week":
			return ResetInterval.Week;
		case "month":
			return ResetInterval.Month;
		case "quarter":
			return ResetInterval.Quarter;
		case "semi_annual":
			return ResetInterval.SemiAnnual;
		case "year":
			return ResetInterval.Year;
	}
};

const toTierBehavior = (
	behavior: "graduated" | "volume",
) => {
	switch (behavior) {
		case "graduated":
			return TierBehavior.Graduated;
		case "volume":
			return TierBehavior.VolumeBased;
	}
};

const toApiPlanItemPrice = (item: PlanItem): CreatePlanItemParamsV1Input["price"] => {
	if (!item.price) return undefined;

	const price = item.price;
	const interval = price.interval ? toBillingInterval(price.interval) : BillingInterval.OneOff;

	return {
		amount: price.amount,
		billing_method: toBillingMethod(price.billingMethod),
		billing_units: price.billingUnits,
		interval,
		interval_count: price.intervalCount,
		max_purchase: price.maxPurchase,
		tier_behavior: "tierBehaviour" in price ? toTierBehavior(price.tierBehaviour) : undefined,
		tiers: price.tiers,
	};
};

const toApiPlanItem = (item: PlanItem): CreatePlanItemParamsV1Input => ({
	feature_id: item.featureId,
	included: item.included,
	price: toApiPlanItemPrice(item),
	reset: item.reset
		? {
				interval: toResetInterval(item.reset.interval),
				interval_count: item.reset.intervalCount,
			}
		: undefined,
	unlimited: item.unlimited,
});

const toApiPlan = (plan: Plan): CreatePlanParamsV2Input => ({
	add_on: plan.addOn,
	auto_enable: plan.autoEnable,
	description: plan.description,
	group: plan.group,
	items: plan.items?.map((item) => toApiPlanItem(item)),
	name: plan.name,
	plan_id: plan.id,
	price: plan.price
		? {
				amount: plan.price.amount,
				interval: toBillingInterval(plan.price.interval),
			}
		: undefined,
});

const toDisplayFeature = (feature: Feature): PlanItemDisplayFeature => ({
	id: feature.id,
	name: feature.name,
	type: feature.type,
});

const formatFreeTrial = (freeTrial?: FreeTrial | null) => {
	if (!freeTrial) return undefined;

	const { durationLength, durationType } = freeTrial;
	const durationUnit = durationLength === 1 ? durationType : `${durationType}s`;
	return `${durationLength} ${durationUnit} free trial`;
};

export const getPlanPreview = ({
	plan,
	features,
	currency = "USD",
}: {
	plan: Plan;
	features: Feature[];
	currency?: string;
}): PlanPreview => {
	const display = getPlanDisplay({
		currency,
		features: features.map((feature) => toDisplayFeature(feature)),
		plan: toApiPlan(plan),
	});

	return {
		basePrice: display.basePriceText,
		features: display.items.map((item) => ({
			primary_text: item.primaryText,
			secondary_text: item.secondaryText,
			tier_details: item.details,
		})),
		freeTrial: formatFreeTrial(plan.freeTrial),
		name: display.name,
	};
};

export const formatPlanPreviewAsText = ({
	preview,
}: {
	preview: PlanPreview;
}): string => {
	const lines: string[] = [preview.name];

	if (preview.basePrice) {
		lines.push(preview.basePrice);
	}

	if (preview.freeTrial) {
		lines.push(preview.freeTrial);
	}

	const featureCount = preview.features.length;

	for (let i = 0; i < featureCount; i++) {
		const feature = preview.features[i];
		if (!feature) continue;
		const isLastFeature = i === featureCount - 1;
		const featurePrefix = isLastFeature ? "\u2514\u2500" : "\u251C\u2500";

		lines.push(`${featurePrefix} ${feature.primary_text}`);

		const continuationPrefix = isLastFeature ? "   " : "\u2502  ";
		if (feature.secondary_text) {
			lines.push(`${continuationPrefix}${feature.secondary_text}`);
		}

		const tierDetails = feature.tier_details ?? [];
		const tierCount = tierDetails.length;
		for (let j = 0; j < tierCount; j++) {
			const tierDetail = tierDetails[j];
			if (!tierDetail) continue;
			const isLastTier = j === tierCount - 1;
			const tierPrefix = isLastTier ? "\u2514\u2500" : "\u251C\u2500";

			lines.push(`${continuationPrefix}${tierPrefix} ${tierDetail}`);
		}
	}

	return lines.join("\n");
};
