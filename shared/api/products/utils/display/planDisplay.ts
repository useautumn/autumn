import type { CreatePlanParamsV2Input } from "@api/products/crud/createPlanParamsV1.js";
import {
	getPlanItemDisplay,
	type PlanItemDisplay,
	type PlanItemDisplayFeature,
} from "@api/products/items/utils/display/index.js";
import { formatAmount } from "@utils/common/formatUtils/formatAmount.js";
import { formatInterval } from "@utils/common/formatUtils/formatInterval.js";

export type PlanDisplay = {
	planId: string;
	name: string;
	basePriceText?: string;
	badges: string[];
	items: PlanItemDisplay[];
};

const formatBasePrice = ({
	currency,
	plan,
}: {
	currency?: string | null;
	plan: CreatePlanParamsV2Input;
}) => {
	if (!plan.price) return undefined;

	const amount = formatAmount({
		amount: plan.price.amount,
		currency: currency ?? undefined,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
			maximumFractionDigits: 10,
		},
	});
	const interval = plan.price.interval
		? formatInterval({
				interval: plan.price.interval,
				intervalCount: plan.price.interval_count,
				prefix: "/",
			})
		: undefined;

	return `${amount}${interval ?? ""}`;
};

const hasPricedItems = (plan: CreatePlanParamsV2Input) =>
	Boolean(plan.items?.some((item) => item.price));

const getBadges = (plan: CreatePlanParamsV2Input) =>
	[
		plan.auto_enable ? "auto-enable" : null,
		plan.add_on ? "add-on" : null,
		plan.group ? `group: ${plan.group}` : null,
	].filter((badge): badge is string => Boolean(badge));

export const getPlanDisplay = ({
	currency,
	features,
	plan,
}: {
	currency?: string | null;
	features: PlanItemDisplayFeature[];
	plan: CreatePlanParamsV2Input;
}): PlanDisplay => {
	const basePriceText = formatBasePrice({ currency, plan });
	const items =
		plan.items?.map((item) =>
			getPlanItemDisplay({ currency, features, item }),
		) ?? [];

	return {
		badges: getBadges(plan),
		basePriceText:
			basePriceText ?? (hasPricedItems(plan) ? undefined : "Free"),
		items,
		name: plan.name,
		planId: plan.plan_id,
	};
};
