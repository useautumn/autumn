import {
	BillingInterval,
	type Feature,
	type FreeTrial,
	type FullCusProduct,
	isCusProductTrialing,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { featureToCusPrice } from "@/internal/customers/cusProducts/cusPrices/convertCusPriceUtils.js";
import { getProration } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { isFeaturePriceItem } from "@/internal/products/product-items/productItemUtils/getItemType.js";
import { itemToPriceOrTiers } from "@/internal/products/product-items/productItemUtils.js";
import { notNullish } from "@/utils/genUtils.js";

export const getOptions = ({
	prodItems,
	features,
	anchor,
	proration,
	now,
	freeTrial,
	cusProduct,
}: {
	prodItems: ProductItem[];
	features: Feature[];
	anchor?: number;
	proration?: {
		start: number;
		end: number;
	};
	now?: number;
	freeTrial?: FreeTrial | null;
	cusProduct?: FullCusProduct;
}) => {
	now = now || Date.now();

	return prodItems
		.filter(
			(i) => isFeaturePriceItem(i) && i.usage_model === UsageModel.Prepaid,
		)
		.map((i) => {
			const finalProration = getProration({
				anchor,
				proration,
				intervalConfig: {
					interval: (i.interval || BillingInterval.OneOff) as BillingInterval,
					intervalCount: i.interval_count || 1,
				},
				now,
			});

			let priceData = itemToPriceOrTiers({
				item: i,
				now,
				proration: finalProration,
			});

			const actualPrice = itemToPriceOrTiers({
				item: i,
			});

			if (
				(freeTrial ||
					(cusProduct && isCusProductTrialing({ cusProduct, now }))) &&
				notNullish(i.interval)
			) {
				priceData = {
					price: 0,
					tiers: undefined,
				};
			}

			const currentOptions = cusProduct?.options.find(
				(o) => o.feature_id === i.feature_id,
			);

			let currentQuantity = currentOptions?.quantity;
			const internalFeatureId = currentOptions?.internal_feature_id;
			let prorationAmount = 0;

			if (currentQuantity && internalFeatureId) {
				currentQuantity = currentQuantity * (i.billing_units || 1);

				const curPrice = featureToCusPrice({
					internalFeatureId: internalFeatureId,
					cusPrices: cusProduct?.customer_prices ?? [],
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
