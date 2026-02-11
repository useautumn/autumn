import type { ApiProductItemV0Schema } from "@api/products/items/previousVersions/apiProductItemV0.js";
import { TierInfinite } from "@models/productV2Models/productItemModels/productItemModels.js";
import {
	isFeatureItem,
	isPriceItem,
} from "@utils/productV2Utils/productItemUtils/getItemType.js";
import { notNullish } from "@utils/utils.js";
import type { z } from "zod/v4";
import type { CusProductLegacyData } from "../cusProductLegacyData.js";
import type { ApiCusProductV1Schema } from "../previousVersions/apiCusProductV1.js";
import type { ApiCusProductV2Schema } from "../previousVersions/apiCusProductV2.js";

/**
 * Transform product from V2 format to V1 format
 * Exported so it can be reused in other transformations (e.g., V0_2_CustomerChange)
 */
const transformItemToPrice = ({
	item,
}: {
	item: z.infer<typeof ApiProductItemV0Schema>;
}) => {
	const singleTier =
		isPriceItem(item) ||
		(item.included_usage === 0 && (item.price || item.tiers?.length === 1));

	if (singleTier) {
		return {
			amount: item.price || item.tiers?.[0].amount || 0,
			interval: item.interval,
			quantity: item.quantity,
		};
	} else {
		// Add allowance to tiers
		const allowance = item.included_usage as number;
		let tiers: {
			to: number | "inf";
			amount: number;
		}[];

		if (notNullish(allowance) && allowance > 0) {
			tiers = [
				{
					to: allowance,
					amount: 0,
				},
				...(item.tiers
					? item.tiers.map((tier) => {
							const isLastTier = tier.to === -1 || tier.to === TierInfinite;
							return {
								to: isLastTier ? tier.to : (tier.to as number) + allowance,
								amount: tier.amount,
							};
						})
					: item.price
						? [
								{
									to: -1,
									amount: item.price || 0,
								},
							]
						: []),
			];
		} else {
			tiers = item.tiers
				? item.tiers.map((tier) => {
						const isLastTier = tier.to === -1 || tier.to === TierInfinite;
						return {
							to: isLastTier ? tier.to : (tier.to as number) + allowance,
							amount: tier.amount,
						};
					})
				: item.price
					? [
							{
								to: -1,
								amount: item.price || 0,
							},
						]
					: [];
		}

		return {
			tiers: tiers,
			name: "",
			quantity: item.quantity,
		};
	}
};

export function transformCusProductV2ToV1({
	input,
	legacyData,
}: {
	input: z.infer<typeof ApiCusProductV2Schema>;
	legacyData?: CusProductLegacyData;
}): z.infer<typeof ApiCusProductV1Schema> {
	const v2CusProduct = input;

	const prices =
		v2CusProduct.items
			?.filter((i) => !isFeatureItem(i))
			.map((i) => transformItemToPrice({ item: i })) || [];

	const subId = legacyData?.subscription_id;

	const v1CusProduct = {
		id: v2CusProduct.id,
		name: v2CusProduct.name,
		group: v2CusProduct.group || "",
		status: v2CusProduct.status,
		created_at: v2CusProduct.started_at, // legacy field..., just use started at...
		canceled_at: v2CusProduct.canceled_at,

		processor: {
			type: "stripe",
			subscription_id: null,
		},
		subscription_ids: subId ? [subId] : [],

		prices: prices,
		starts_at: v2CusProduct.started_at,

		current_period_end: v2CusProduct.current_period_end,
		current_period_start: v2CusProduct.current_period_start,
	} as z.infer<typeof ApiCusProductV1Schema>;

	return v1CusProduct;
}
