import {
	type EntitlementWithFeature,
	type FullProduct,
	formatAmount,
	type Organization,
	type Price,
	type Reward,
} from "@autumn/shared";
import type Stripe from "stripe";
import { newPriceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { getProration } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import {
	isFixedPrice,
	isOneOffPrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";
import {
	formatReward,
	getAmountAfterReward,
	getAmountAfterStripeDiscounts,
} from "@/internal/rewards/rewardUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";

export const priceToNewPreviewItem = ({
	org,
	price,
	entitlements,
	skipOneOff,
	now,
	anchor,
	productQuantity = 1,
	product,
	onTrial,
	rewards,
	subDiscounts,
}: {
	org: Organization;
	price: Price;
	entitlements: EntitlementWithFeature[];
	skipOneOff?: boolean;
	now?: number;
	anchor?: number;
	productQuantity?: number;
	product: FullProduct;
	onTrial?: boolean;
	rewards?: Reward[];
	subDiscounts?: Stripe.Discount[];
}) => {
	if (skipOneOff && isOneOffPrice({ price })) return;

	now = now ?? Date.now();

	const ent = getPriceEntitlement(price, entitlements);

	const finalProration = getProration({
		anchor,
		now,
		intervalConfig: {
			interval: price.config.interval!,
			intervalCount: price.config.interval_count || 1,
		},
	});

	const applyRewards = rewards?.filter(
		(r) =>
			r.discount_config?.price_ids?.includes(price.id) ||
			r.discount_config?.apply_to_all,
	);

	for (const reward of applyRewards ?? []) {
		console.log("Apply Reward", formatReward({ reward }));
	}

	if (isFixedPrice({ price })) {
		let amount = priceToInvoiceAmount({
			price,
			quantity: 1,
			proration: finalProration,
			productQuantity,
			now,
		});

		if (onTrial) {
			amount = 0;
		}

		for (const reward of applyRewards ?? []) {
			amount = getAmountAfterReward({
				amount,
				reward,
				subDiscounts: subDiscounts ?? [],
				currency: org.default_currency || undefined,
			});
		}

		amount = getAmountAfterStripeDiscounts({
			price,
			amount,
			product,
			stripeDiscounts: subDiscounts ?? [],
			currency: org.default_currency || undefined,
		});

		let description = newPriceToInvoiceDescription({
			org,
			price,
			product,
		});

		if (productQuantity > 1) {
			description = `${description} x ${productQuantity}`;
		}

		if (finalProration) {
			description = `${description} (from ${formatUnixToDate(now)})`;
		}

		return {
			price_id: price.id,
			price: formatAmount({ org, amount }),
			description,
			amount,
			usage_model: priceToUsageModel(price),
			feature_id: ent?.feature_id,
		};
	}
};
