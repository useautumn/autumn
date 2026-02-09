import { ApiProductItemV0Schema } from "@api/products/items/previousVersions/apiProductItemV0.js";
import type { FeatureOptions } from "@models/cusProductModels/cusProductModels.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import {
	type PriceTier,
	type ProductItem,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import { toApiFeature } from "@utils/featureUtils.js";
import { getProductItemDisplay } from "@utils/productDisplayUtils.js";
import { notNullish } from "@utils/utils.js";
import { Decimal } from "decimal.js";
import { getItemType } from "./getItemType.js";

/**
 * @deprecated Use `applyProration` from `@autumn/shared` instead.
 * This function will be removed in a future version.
 */
export const calculateProrationAmount = ({
	periodEnd,
	periodStart,
	now,
	amount,
	allowNegative = false,
}: {
	periodEnd: number;
	periodStart: number;
	now: number;
	amount: number;
	allowNegative?: boolean;
}) => {
	const num = new Decimal(periodEnd).minus(now);
	const denom = new Decimal(periodEnd).minus(periodStart);

	const proratedAmount = num.div(denom).mul(amount);

	if (proratedAmount.lte(0) && !allowNegative) {
		return 0;
	}

	return proratedAmount.toNumber();
};

export type Proration = {
	start: number;
	end: number;
};

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
				tiers: item.tiers.map((tier: PriceTier) => ({
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

export const getProductItemResponse = ({
	item,
	features,
	currency,
	withDisplay = true,
	options,
}: {
	item: ProductItem;
	features: Feature[];
	currency?: string | null;
	withDisplay?: boolean;
	options?: FeatureOptions[];
}) => {
	// 1. Get item type
	const type = getItemType(item);

	// 2. Get display
	const display = getProductItemDisplay({
		item,
		features,
		currency,
	});

	const priceData = itemToPriceOrTiers({ item });

	let quantity: number | undefined;
	let upcomingQuantity: number | undefined;

	if (item.usage_model === UsageModel.Prepaid && notNullish(options)) {
		const option = options!.find((o) => o.feature_id === item.feature_id);
		quantity = option?.quantity
			? option?.quantity * (item.billing_units ?? 1)
			: undefined;

		upcomingQuantity = option?.upcoming_quantity
			? option?.upcoming_quantity * (item.billing_units ?? 1)
			: undefined;
	}

	const feature = features.find((f) => f.id === item.feature_id);
	return ApiProductItemV0Schema.parse({
		type,
		...item,
		feature: feature ? toApiFeature({ feature }) : null,
		display: withDisplay ? display : undefined,
		...priceData,
		quantity,
		next_cycle_quantity: upcomingQuantity,
	});
};
