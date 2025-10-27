import {
	type BillingInterval,
	BillingType,
	cusProductToPrices,
	type FullCusProduct,
	type FullProduct,
	intervalsDifferent,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { findPriceInStripeItems } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { attachParamsToProduct } from "../convertAttachParams.js";
import { getContUseInvoiceItems } from "./getContUseInvoiceItems.js";

export const filterContUsageProrations = async ({
	sub,
	stripeCli,
	curCusProduct,
	newProduct,
	logger,
}: {
	sub: Stripe.Subscription;
	stripeCli: Stripe;
	curCusProduct: FullCusProduct;
	newProduct: FullProduct;
	logger: any;
}) => {
	const curPrices = cusProductToPrices({
		cusProduct: curCusProduct,
	});
	const allPrices = [...curPrices, ...newProduct.prices];

	// const upcomingLines = await stripeCli.invoices.listUpcomingLines({
	//   subscription: sub.id,
	// });

	const pendingItems = await stripeCli.invoiceItems.list({
		pending: true,
		customer: sub.customer as string,
	});

	const intervalSet = subToAutumnInterval(sub);

	for (const item of pendingItems.data) {
		// console.log("LINE ITEM:", item);
		if (!item.proration) continue;

		const price = findPriceInStripeItems({
			prices: allPrices,
			lineItem: item,
			billingType: BillingType.InArrearProrated,
		});

		if (!price) continue;

		const atmnAmount = stripeToAtmnAmount({
			amount: item.amount,
			currency: item.currency,
		});

		logger.info(
			`Deleting ii: ${item.description} - ${atmnAmount} (${intervalSet.interval}, ${intervalSet.intervalCount})`,
		);

		await stripeCli.invoiceItems.del(item.id);
	}
};

export const createAndFilterContUseItems = async ({
	attachParams,
	curMainProduct,
	// stripeSubs,
	sub,
	logger,
	interval,
	intervalCount,
}: {
	attachParams: AttachParams;
	curMainProduct: FullCusProduct;
	// stripeSubs: Stripe.Subscription[];
	sub: Stripe.Subscription;
	logger: any;
	interval?: BillingInterval;
	intervalCount?: number;
}) => {
	const { stripeCli, customer, org } = attachParams;
	const product = attachParamsToProduct({ attachParams });
	// const sameIntervals = intervalsAreSame({ attachParams });
	const now = attachParams.now || Date.now();

	// if (!sameIntervals) {
	//   return { newItems: [], oldItems: [], replaceables: [] };
	// }

	const { newItems, oldItems, replaceables } = await getContUseInvoiceItems({
		attachParams,
		cusProduct: curMainProduct!,
		sub,
		logger,
	});

	await filterContUsageProrations({
		sub,
		stripeCli,
		curCusProduct: curMainProduct,
		newProduct: product,
		logger,
	});

	const items = [...oldItems, ...newItems];
	const curPrices = cusProductToPrices({
		cusProduct: curMainProduct,
	});

	for (const item of items) {
		if (!item.amount || item.amount === 0) {
			continue;
		}

		const price =
			product.prices.find((p) => p.id === item.price_id) ||
			curPrices.find((p) => p.id === item.price_id);

		if (
			interval &&
			price?.config &&
			intervalsDifferent({
				// price?.config.interval !== interval
				intervalA: price?.config,
				intervalB: { interval, intervalCount },
			})
		) {
			continue;
		}

		logger.info(
			`Adding invoice item: ${item.description}, amount: ${item.amount}, interval: ${interval}`,
		);

		const { start, end } = subToPeriodStartEnd({ sub });
		await stripeCli.invoiceItems.create({
			customer: customer.processor?.id!,
			amount: Math.round(item.amount * 100),
			description: item.description,
			currency: org.default_currency || "usd",
			subscription: sub.id,
			period: {
				start: Math.floor(now / 1000),
				end: end,
			},
		});
	}

	return { newItems, oldItems, replaceables };
};
