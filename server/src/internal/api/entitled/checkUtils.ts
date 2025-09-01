import {
	APIVersion,
	BillingInterval,
	type Feature,
	type FreeTrial,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	type ProductItem,
	SuccessCode,
	UsageModel,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { featureToCusPrice } from "@/internal/customers/cusProducts/cusPrices/convertCusPriceUtils.js";
import { getProration } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { isFeaturePriceItem } from "@/internal/products/product-items/productItemUtils/getItemType.js";
import { itemToPriceOrTiers } from "@/internal/products/product-items/productItemUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { getCheckPreview } from "./getCheckPreview.js";

export const getBooleanEntitledResult = async ({
	db,
	fullCus,
	cusEnts,
	res,
	feature,
	apiVersion,
	withPreview,
	cusProducts,
	allFeatures,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	cusEnts: FullCustomerEntitlement[];
	res: any;
	feature: Feature;
	apiVersion: number;
	withPreview: boolean;
	cusProducts: FullCusProduct[];
	allFeatures: Feature[];
}) => {
	const allowed = cusEnts.some((cusEnt) => {
		const featureMatch = cusEnt.internal_feature_id === feature.internal_id;

		const entityFeatureId = cusEnt.entitlement.entity_feature_id;
		const compareEntity =
			notNullish(entityFeatureId) && notNullish(fullCus.entity);

		const entityMatch = compareEntity
			? entityFeatureId === fullCus.entity?.feature_id
			: true;

		return featureMatch && entityMatch;
	});

	if (apiVersion >= APIVersion.v1_1) {
		return res.status(200).json({
			customer_id: fullCus.id,
			feature_id: feature.id,
			code: SuccessCode.FeatureFound,
			allowed,
			preview: withPreview
				? await getCheckPreview({
						db,
						allowed,
						balance: undefined,
						feature,
						cusProducts,
						allFeatures,
					})
				: undefined,
		});
	} else {
		return res.status(200).json({
			allowed,
			balances: allowed
				? [
						{
							feature_id: feature.id,
							balance: null,
						},
					]
				: [],
		});
	}
};

export const getOptions = ({
	prodItems,
	features,
	anchorToUnix,
	proration,
	now,
	freeTrial,
	cusProduct,
}: {
	prodItems: ProductItem[];
	features: Feature[];
	anchorToUnix?: number;
	proration?: {
		start: number;
		end: number;
	};
	now?: number;
	freeTrial?: FreeTrial | null;
	cusProduct?: FullCusProduct;
}) => {
	now = now || Date.now();

	// console.log("Now:", formatUnixToDate(now));
	// console.log("Anchor to unix:", formatUnixToDate(anchorToUnix));

	return prodItems
		.filter(
			(i) => isFeaturePriceItem(i) && i.usage_model === UsageModel.Prepaid,
		)
		.map((i) => {
			const finalProration = getProration({
				anchorToUnix,
				proration,
				interval: (i.interval || BillingInterval.OneOff) as BillingInterval,
				intervalCount: i.interval_count || 1,
				now,
			});

			if (finalProration) {
			}

			let priceData = itemToPriceOrTiers({
				item: i,
				proration: finalProration,
				now,
			});

			const actualPrice = itemToPriceOrTiers({
				item: i,
			});

			if (freeTrial && notNullish(i.interval)) {
				priceData = {
					price: 0,
					tiers: undefined,
				};
			}

			const currentOptions = cusProduct?.options.find(
				(o) => o.feature_id === i.feature_id,
			);

			let currentQuantity = currentOptions?.quantity;
			let prorationAmount = 0;

			if (currentQuantity) {
				currentQuantity = currentQuantity * (i.billing_units || 1);

				const curPrice = featureToCusPrice({
					internalFeatureId: currentOptions?.internal_feature_id!,
					cusPrices: cusProduct?.customer_prices!,
				})?.price;

				const curPriceAmount = priceToInvoiceAmount({
					price: curPrice!,
					quantity: currentQuantity,
					now,
					proration: finalProration,
				});

				const newPriceAmount = priceToInvoiceAmount({
					item: i,
					quantity: currentQuantity,
					now,
					proration: finalProration,
				});

				prorationAmount = new Decimal(newPriceAmount)
					.minus(curPriceAmount)
					.toNumber();
			}

			return {
				feature_id: i.feature_id,
				feature_name: features.find((f) => f.id === i.feature_id)?.name,
				billing_units: i.billing_units,
				included_usage: i.included_usage || 0,
				...priceData,

				full_price: actualPrice?.price,
				full_tiers: actualPrice?.tiers,

				current_quantity: notNullish(currentQuantity)
					? currentQuantity
					: undefined,
				proration_amount: prorationAmount,
				config: i.config,
				interval: i.interval,
			};
		});
};
