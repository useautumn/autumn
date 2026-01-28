import {
	type BillingInterval,
	BillingType,
	cusProductsToCusPrices,
	cusProductToCusEnts,
	customerPriceToCustomerEntitlement,
	type FullCusProduct,
	intervalsDifferent,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getCusPriceUsage } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import {
	formatPrice,
	getBillingType,
} from "@/internal/products/prices/priceUtils.js";

const getUsageInvoiceItems = async ({
	db,
	logger,
	attachParams,
	cusProduct,
	// stripeSubs,
	sub,
	interval,
	intervalCount,
}: {
	db: DrizzleCli;
	logger: any;
	attachParams: AttachParams;
	cusProduct: FullCusProduct;
	// stripeSubs: Stripe.Subscription[];
	sub: Stripe.Subscription;
	interval?: BillingInterval;
	intervalCount?: number;
}) => {
	const { stripeCli, org } = attachParams;

	const cusPrices = cusProductsToCusPrices({
		cusProducts: [cusProduct],
	});

	const cusEnts = cusProductToCusEnts({ customerProduct: cusProduct });

	const invoiceItems: any[] = [];
	const cusEntIds: string[] = [];

	for (const cusPrice of cusPrices) {
		const config = cusPrice.price.config! as UsagePriceConfig;
		const billingType = getBillingType(config);

		if (billingType !== BillingType.UsageInArrear) continue;

		const { description, amount } = getCusPriceUsage({
			cusPrice,
			cusProduct,
			logger,
		});

		if (amount <= 0) continue;

		const cusEnt = customerPriceToCustomerEntitlement({
			customerPrice: cusPrice,
			customerEntitlements: cusEnts,
		})!;

		if (!cusEnt) {
			console.log("Price:", formatPrice({ price: cusPrice.price }));
			console.log("Cus ents:", cusEnts);
			console.log("NO CUS ENT FOUND");
		}

		if (
			interval &&
			intervalsDifferent({
				intervalA: { interval, intervalCount },
				intervalB: subToAutumnInterval(sub),
			})
		)
			continue;

		cusEntIds.push(cusEnt.id);

		const invoiceItem = {
			description,
			price_data: {
				product: config.stripe_product_id!,
				unit_amount: Math.round(amount * 100),
				currency: org.default_currency || "usd",
			},
			period: {
				start: sub.items.data[0].current_period_start,
				end: Math.floor((attachParams.now || Date.now()) / 1000),
			},
		};

		invoiceItems.push(invoiceItem);
	}

	return {
		invoiceItems,
		cusEntIds,
	};
};

export const createUsageInvoiceItems = async ({
	db,
	attachParams,
	cusProduct,
	sub,
	invoiceId,
	logger,
	interval,
	intervalCount,
}: {
	db: DrizzleCli;
	attachParams: AttachParams;
	cusProduct: FullCusProduct;
	sub: Stripe.Subscription;
	invoiceId?: string;
	logger: Logger;
	interval?: BillingInterval;
	intervalCount?: number;
}) => {
	const { stripeCli } = attachParams;

	const { invoiceItems, cusEntIds } = await getUsageInvoiceItems({
		db,
		attachParams,
		cusProduct,
		// stripeSubs,
		sub,
		interval,
		intervalCount,
		logger,
	});

	const batchCreate = [];

	for (let i = 0; i < invoiceItems.length; i++) {
		const invoiceItem = invoiceItems[i];
		const createInvoiceItem = async () => {
			logger.info(
				`🌟 Creating usage invoice item: ${invoiceItem.description}, amount: ${invoiceItem.price_data.unit_amount}`,
			);

			await stripeCli.invoiceItems.create({
				...invoiceItem,
				invoice: invoiceId ? invoiceId : undefined,
				subscription: invoiceId ? undefined : sub.id,
				customer: attachParams.customer.processor.id,
			});
		};

		batchCreate.push(createInvoiceItem());
	}
	await Promise.all(batchCreate);

	return {
		invoiceItems,
		cusEntIds,
	};
};

export const resetUsageBalances = async ({
	db,
	cusEntIds,
	cusProduct,
}: {
	db: DrizzleCli;
	cusEntIds: string[];
	cusProduct: FullCusProduct;
}) => {
	for (const cusEntId of cusEntIds) {
		await CusEntService.update({
			db,
			id: cusEntId,
			updates: {
				balance: 0,
			},
		});

		const index = cusProduct.customer_entitlements.findIndex(
			(ce) => ce.id === cusEntId,
		);

		cusProduct.customer_entitlements[index] = {
			...cusProduct.customer_entitlements[index],
			balance: 0,
		};
	}
};
