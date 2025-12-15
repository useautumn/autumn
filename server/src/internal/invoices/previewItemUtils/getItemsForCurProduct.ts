import {
	type AttachBranch,
	type AttachConfig,
	BillingType,
	cusProductToPrices,
	formatAmount,
	InternalError,
	isConsumablePrice,
	type PreviewLineItem,
} from "@autumn/shared";
import type Stripe from "stripe";
import { priceToUnusedPreviewItem } from "@/internal/customers/attach/attachPreviewUtils/priceToUnusedPreviewItem.js";
import { attachParamsToCurCusProduct } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { getContUseInvoiceItems } from "@/internal/customers/attach/attachUtils/getContUseItems/getContUseInvoiceItems.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getCusPriceUsage } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { isContUsePrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import type { Logger } from "../../../external/logtail/logtailUtils";

export const getItemsForCurProduct = async ({
	sub,
	attachParams,
	// biome-ignore lint/correctness/noUnusedFunctionParameters: might be used in the future
	branch,
	// biome-ignore lint/correctness/noUnusedFunctionParameters: might be used in the future
	config,
	now,
	logger,
}: {
	sub?: Stripe.Subscription;
	attachParams: AttachParams;
	branch: AttachBranch;
	config: AttachConfig;
	now: number;
	logger: Logger;
}) => {
	const curCusProduct = attachParamsToCurCusProduct({ attachParams });

	if (!curCusProduct) {
		throw new InternalError({
			message: "current customer product is undefined",
		});
	}

	let items: PreviewLineItem[] = [];
	const subItems = sub?.items.data || [];
	const curPrices = cusProductToPrices({ cusProduct: curCusProduct });
	// const anchor = sub?.billing_cycle_anchor ? sub.billing_cycle_anchor * 1000 : undefined;

	for (const price of curPrices) {
		if (isConsumablePrice(price) || isContUsePrice({ price })) {
			continue;
		}

		const previewLineItem = priceToUnusedPreviewItem({
			anchor: sub?.billing_cycle_anchor
				? sub.billing_cycle_anchor * 1000
				: undefined,
			price,
			stripeItems: subItems,
			cusProduct: curCusProduct,
			org: attachParams.org,
			now,
			latestInvoice: sub?.latest_invoice as Stripe.Invoice,
			subDiscounts: sub?.discounts as Stripe.Discount[],
		});

		if (!previewLineItem) continue;

		items.push(previewLineItem);
	}

	// console.log("items: ", items);

	const { oldItems } = await getContUseInvoiceItems({
		sub,
		attachParams,
		logger,
		cusProduct: curCusProduct,
	});

	items = [...items, ...oldItems];

	for (const price of curPrices) {
		const billingType = getBillingType(price.config);

		if (billingType === BillingType.UsageInArrear) {
			const { amount, description } = getCusPriceUsage({
				price,
				cusProduct: curCusProduct,
				logger,
			});

			if (!amount || amount <= 0) continue;

			items.push({
				price: formatAmount({
					org: attachParams.org,
					amount,
				}),
				description,
				amount,
				price_id: price.id!,
				usage_model: priceToUsageModel(price),
			});
		}
	}

	return items;
};
