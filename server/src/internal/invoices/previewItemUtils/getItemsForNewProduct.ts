import {
	BillingInterval,
	BillingType,
	type EntitlementWithFeature,
	type Feature,
	type FreeTrial,
	type FullProduct,
	getFeatureInvoiceDescription,
	type IntervalConfig,
	isFixedPrice,
	isOneOffPrice,
	isUsagePrice,
	type Organization,
	type PreviewLineItem,
	type Price,
	priceToInvoiceAmount,
	toProductItem,
	UsageModel,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { attachParamsToCurCusProduct } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { getContUseInvoiceItems } from "@/internal/customers/attach/attachUtils/getContUseItems/getContUseInvoiceItems.js";
import {
	getAlignedUnix,
	getPeriodStartForEnd,
} from "@/internal/products/prices/billingIntervalUtils2.js";
import {
	priceToFeature,
	priceToUsageModel,
} from "@/internal/products/prices/priceUtils/convertPrice.js";
import { sortPricesByType } from "@/internal/products/prices/priceUtils/sortPriceUtils.js";
import { formatAmount } from "@/utils/formatUtils.js";
import { formatUnixToDate, notNullish } from "@/utils/genUtils.js";
import type { AttachParams } from "../../customers/cusProducts/AttachParams.js";
import { getPricecnPrice } from "../../products/pricecn/pricecnUtils.js";
import { subtractIntervalForProration } from "../../products/prices/billingIntervalUtils.js";
import { isPrepaidPrice } from "../../products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";

import {
	formatPrice,
	getBillingType,
	getPriceEntitlement,
	getPriceForOverage,
	getPriceOptions,
} from "../../products/prices/priceUtils.js";
import { newPriceToInvoiceDescription } from "../invoiceFormatUtils.js";
import { calculateProrationAmount } from "../prorationUtils.js";

export const getDefaultPriceStr = ({
	org,
	price,
	ent,
	features,
}: {
	org: Organization;
	price: Price;
	ent: EntitlementWithFeature;
	features: Feature[];
}) => {
	const item = toProductItem({
		ent: ent!,
		price,
	});

	const priceText = getPricecnPrice({
		org,
		items: [item],
		features,
		isMainPrice: true,
	});

	return `${priceText.primaryText} ${priceText.secondaryText}`;
};

export const getProration = ({
	proration,
	anchor,
	intervalConfig,
	now,
}: {
	proration?: Partial<{
		start: number;
		end: number;
	}>;
	anchor?: number; // used to indicate a future date to anchor the next period end to...
	intervalConfig: IntervalConfig;
	now?: number;
}) => {
	let { interval, intervalCount } = intervalConfig;
	intervalCount = intervalCount ?? 1;
	now = now || Date.now();

	if (interval === BillingInterval.OneOff) return undefined;

	let end = proration?.end;
	if (!end && anchor) {
		end = getAlignedUnix({
			anchor: anchor!,
			intervalConfig,
			now,
		});
	}

	let start = proration?.start;
	if (!start && end && anchor) {
		// Find the period start by iterating from the anchor until we reach the period that contains 'now'
		// This ensures we get the correct period even when the anchor day doesn't exist in some months
		// e.g., anchor=31 Oct, now=14 Nov, end=30 Nov -> start should be 31 Oct, not 30 Oct
		start = getPeriodStartForEnd({
			anchor,
			intervalConfig,
			targetEnd: end,
		});
	} else if (!start && end) {
		// Fallback to old behavior if no anchor is provided
		start = subtractIntervalForProration({
			unixTimestamp: end!,
			interval,
			intervalCount,
		});
	}

	if (!start || !end) return undefined;

	return {
		start,
		end,
	};
};

export const getItemsForNewProduct = async ({
	newProduct,
	attachParams,
	proration,
	anchor,
	freeTrial,
	sub,
	logger,
	withPrepaid = false,
	skipOneOff = false,
}: {
	newProduct: FullProduct;
	attachParams: AttachParams;
	proration?: {
		start: number;
		end: number;
	};
	anchor?: number;
	freeTrial?: FreeTrial | null;
	sub?: Stripe.Subscription;
	logger: any;
	withPrepaid?: boolean;
	skipOneOff?: boolean;
}) => {
	const { org, features } = attachParams;
	const now = attachParams.now || Date.now();

	const items: PreviewLineItem[] = [];

	sortPricesByType(newProduct.prices);

	const printLogs = false;

	for (const price of newProduct.prices) {
		if (skipOneOff && isOneOffPrice(price)) continue;

		const ent = getPriceEntitlement(price, newProduct.entitlements);
		const billingType = getBillingType(price.config);

		if (printLogs) {
			console.log("price", formatPrice({ price }));
			console.log("now:", formatUnixToDate(now));
			console.log("anchor", formatUnixToDate(anchor));
		}

		const finalProration = getProration({
			proration,
			anchor,
			now,
			intervalConfig: {
				interval: price.config.interval!,
				intervalCount: price.config.interval_count || 1,
			},
		});

		if (printLogs && finalProration) {
			console.log(
				`PRORATION: ${formatUnixToDate(finalProration.start)} to ${formatUnixToDate(finalProration.end)}`,
			);
		}
		if (printLogs) console.log("--------------------------------");

		if (isFixedPrice(price)) {
			let amount = finalProration
				? calculateProrationAmount({
						periodEnd: finalProration.end,
						periodStart: finalProration.start,
						now,
						amount: getPriceForOverage(price),
					})
				: getPriceForOverage(price, 0);

			if (freeTrial) {
				amount = 0;
			}

			let description = newPriceToInvoiceDescription({
				org,
				price,
				product: newProduct,
			});

			if (finalProration) {
				description = `${description} (from ${formatUnixToDate(now)})`;
			}

			items.push({
				price_id: price.id,
				price: formatAmount({ org, amount }),
				description,
				amount,
				usage_model: priceToUsageModel(price),
				feature_id: ent?.feature_id,
			});
			continue;
		}

		if (billingType === BillingType.UsageInArrear) {
			items.push({
				price: getDefaultPriceStr({ org, price, ent: ent!, features }),
				description: newPriceToInvoiceDescription({
					org,
					price,
					product: newProduct,
				}),
				usage_model: priceToUsageModel(price),
				price_id: price.id,
				feature_id: ent?.feature_id,
			});
			continue;
		}

		if (withPrepaid && isPrepaidPrice({ price })) {
			const options = getPriceOptions(price, attachParams.optionsList);
			const quantity = notNullish(options?.quantity) ? options?.quantity : 1;

			const quantityWithBillingUnits = new Decimal(quantity).mul(
				(price.config as UsagePriceConfig).billing_units || 1,
			);

			const amount = priceToInvoiceAmount({
				price,
				quantity: quantityWithBillingUnits.toNumber(),
				proration: finalProration,
				now,
			});

			const feature = priceToFeature({
				price,
				features,
			})!;

			items.push({
				price_id: price.id,
				price: formatAmount({ org, amount: 0 }),
				description: getFeatureInvoiceDescription({
					feature,
					usage: quantity,
					billingUnits: (price.config as UsagePriceConfig).billing_units,
					prodName: newProduct.name,
					isPrepaid: true,
					fromUnix: now,
				}),
				amount,
				usage_model: UsageModel.Prepaid,
				feature_id: ent?.feature_id,
			});
		}

		if (isUsagePrice({ price })) continue;
	}

	const cusProduct = attachParamsToCurCusProduct({ attachParams });

	const { newItems } = await getContUseInvoiceItems({
		cusProduct,
		sub,
		attachParams,
		logger,
	});

	items.push(...newItems);

	for (const item of items) {
		if (item.amount && freeTrial) {
			item.amount = 0;
		}
		if (item.amount && item.amount < 0) {
			item.amount = 0;
		}
		if (notNullish(item.amount)) {
			item.price = formatAmount({ org, amount: item.amount! });
		}
	}

	return items;
};
