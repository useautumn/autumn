import {
	type BillingInterval,
	EntInterval,
	Feature,
	FeatureType,
	Infinite,
	type ProductItem,
	type ProductItemFeatureType,
	ProductItemInterval,
	ProductItemType,
	type UsageModel,
} from "@autumn/shared";
import {
	calculateProrationAmount,
	type Proration,
} from "@/internal/invoices/prorationUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import {
	billingToItemInterval,
	entToItemInterval,
} from "./itemIntervalUtils.js";
import { isFeatureItem } from "./productItemUtils/getItemType.js";

export const itemToPriceOrTiers = ({
	item,
	proration,
	now,
}: {
	item: ProductItem;
	proration?: Proration;
	now?: number;
}) => {
	now = now || Date.now();
	if (item.price) {
		return {
			price: proration
				? calculateProrationAmount({
						periodEnd: proration.end,
						periodStart: proration.start,
						now,
						amount: item.price,
					})
				: item.price,
			tiers: undefined,
		};
	} else if (item.tiers) {
		if (item.tiers.length > 1) {
			return {
				price: undefined,
				tiers: item.tiers.map((tier) => ({
					...tier,
					amount: proration
						? calculateProrationAmount({
								periodEnd: proration.end,
								periodStart: proration.start,
								now,
								amount: tier.amount,
							})
						: tier.amount,
				})),
			};
		} else {
			return {
				price: proration
					? calculateProrationAmount({
							periodEnd: proration.end,
							periodStart: proration.start,
							now,
							amount: item.tiers[0].amount,
						})
					: item.tiers[0].amount,
				tiers: undefined,
			};
		}
	}
};

// FOR TESTS?
export const constructFeatureItem = ({
	feature_id,
	included_usage,
	interval = EntInterval.Month,
	entitlement_id,
	entity_feature_id,
}: {
	feature_id: string;
	included_usage?: number | string;
	interval?: EntInterval;
	entitlement_id?: string;
	entity_feature_id?: string;
}) => {
	const item: ProductItem = {
		feature_id,
		included_usage: included_usage as number,
		interval: entToItemInterval(interval),
		entitlement_id,
		entity_feature_id,
	};

	return item;
};

export const constructPriceItem = ({
	price,
	interval,
	intervalCount,
}: {
	price: number;
	interval: BillingInterval | null;
	intervalCount?: number;
}) => {
	const item: ProductItem = {
		price: price,
		interval: interval as any,
		interval_count: intervalCount || 1,
	};

	return item;
};

export const constructFeaturePriceItem = ({
	feature_id,

	feature_type,
	included_usage,
	price,
	interval,
	usage_model,
	billing_units = 1,
	reset_usage_when_enabled = false,
	entity_feature_id,
}: {
	feature_id: string;
	feature_type?: ProductItemFeatureType;
	included_usage?: number;
	price: number;
	interval: BillingInterval;
	usage_model?: UsageModel;
	billing_units?: number;
	reset_usage_when_enabled?: boolean;
	entity_feature_id?: string;
}) => {
	const item: ProductItem & {
		included_usage: number;
	} = {
		feature_id,
		feature_type,
		included_usage: included_usage as number,
		price,
		interval: billingToItemInterval(interval),
		usage_model,
		billing_units,
		reset_usage_when_enabled,
		entity_feature_id,
	};

	return item;
};
