import {
	type Feature,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	getFeatureInvoiceDescription,
	type InsertReplaceable,
	InternalError,
	OnDecrease,
	OnIncrease,
	type Product,
	priceToInvoiceAmount,
	shouldProrate,
	shouldProrateDowngradeNow,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { stripeSubscriptionToNowMs } from "@/external/stripe/subscriptions/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { getReplaceables } from "@/internal/products/prices/priceUtils/arrearProratedUtils/getContUsageDowngradeItem.js";
import { roundUsage } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { getUsageFromBalance } from "../adjustAllowance.js";

const createDowngradeProrationInvoice = async ({
	ctx,
	cusPrice,
	stripeCli,
	sub,
	subItem,
	newPrice,
	prevPrice,
	newRoundedUsage,
	feature,
	product,
	onIncrease,
	onDecrease,
}: {
	ctx: AutumnContext;
	cusPrice: FullCustomerPrice;
	stripeCli: Stripe;
	sub: Stripe.Subscription;
	subItem: Stripe.SubscriptionItem;
	newPrice: number;
	prevPrice: number;
	newRoundedUsage: number;
	feature: Feature;
	product: Product;
	onIncrease: OnIncrease;
	onDecrease: OnDecrease;
}) => {
	const { logger } = ctx;
	const config = cusPrice.price.config as UsagePriceConfig;

	const now = await stripeSubscriptionToNowMs({
		stripeSubscription: sub,
		stripeCli,
	});
	let invoiceAmount = new Decimal(newPrice).minus(prevPrice).toNumber();

	logger.info(`Prev price: ${prevPrice}, New price: ${newPrice}`);
	logger.info(`Invoice amount: ${invoiceAmount}`);

	let invoiceDescription = getFeatureInvoiceDescription({
		feature,
		usage: newRoundedUsage,
		billingUnits: config.billing_units,
		prodName: product.name,
	});

	invoiceAmount = calculateProrationAmount({
		periodStart: subItem.current_period_start * 1000,
		periodEnd: subItem.current_period_end * 1000,
		now,
		amount: invoiceAmount,
		allowNegative: true,
	});

	const start = formatUnixToDate(now);
	const end = formatUnixToDate(subItem.current_period_end * 1000);
	invoiceDescription = `${invoiceDescription} (from ${start} to ${end})`;

	if (invoiceAmount === 0) return;

	logger.info(
		`🚀 Creating invoice item: ${invoiceDescription} - ${invoiceAmount.toFixed(2)}`,
	);

	const invoiceItem = constructStripeInvoiceItem({
		ctx,
		product,
		amount: invoiceAmount,
		price: cusPrice.price,
		description: invoiceDescription,
		stripeSubId: sub.id,
		stripeCustomerId: sub.customer as string,
		periodStart: Math.floor(now / 1000),
		periodEnd: Math.floor(subItem.current_period_end * 1000),
	});

	await stripeCli.invoiceItems.create(invoiceItem);
	let invoice = null;

	if (
		shouldProrateDowngradeNow({
			onIncrease,
			onDecrease,
		})
	) {
		const { invoice: finalInvoice } = await createAndFinalizeInvoice({
			stripeCli,
			paymentMethod: null,
			stripeCusId: sub.customer as string,
			stripeSubId: sub.id,
			logger,
		});

		invoice = finalInvoice;
	}

	return invoice;
};

export const handleProratedDowngrade = async ({
	ctx,
	stripeCli,
	cusEnt,
	cusPrice,
	sub,
	subItem,
	newBalance,
	prevBalance,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	cusEnt: FullCusEntWithFullCusProduct;
	cusPrice: FullCustomerPrice;
	sub: Stripe.Subscription;
	subItem: Stripe.SubscriptionItem;
	newBalance: number;
	prevBalance: number;
}) => {
	const { logger } = ctx;
	logger.info(`Handling quantity decrease`);

	if (!cusEnt.customer_product) {
		throw new InternalError({
			message: `[handleProratedDowngrade] Customer entitlement has no customer product: ${cusEnt.id}`,
		});
	}

	const { overage: prevOverage, usage: prevUsage } = getUsageFromBalance({
		ent: cusEnt.entitlement,
		price: cusPrice.price,
		balance: prevBalance,
	});

	const { overage: newOverage, usage: newUsage } = getUsageFromBalance({
		ent: cusEnt.entitlement,
		price: cusPrice.price,
		balance: newBalance,
	});

	const onDecrease =
		cusPrice.price.proration_config?.on_decrease ||
		OnDecrease.ProrateImmediately;

	const feature = cusEnt.entitlement.feature;
	const product = cusEnt.customer_product.product;

	let invoice = null;
	let newReplaceables: InsertReplaceable[] = [];

	if (onDecrease === OnDecrease.NoProrations || sub.status === "trialing") {
	} else if (shouldProrate(onDecrease)) {
		const prevPrice = priceToInvoiceAmount({
			price: cusPrice.price,
			overage: roundUsage({
				usage: prevOverage,
				price: cusPrice.price,
			}),
		});

		const newPrice = priceToInvoiceAmount({
			price: cusPrice.price,
			overage: roundUsage({
				usage: newOverage,
				price: cusPrice.price,
			}),
		});

		invoice = await createDowngradeProrationInvoice({
			ctx,
			cusPrice,
			stripeCli,
			sub,
			subItem,
			newPrice,
			prevPrice,
			newRoundedUsage: roundUsage({
				usage: newUsage,
				price: cusPrice.price,
			}),
			feature,
			product,
			onIncrease:
				cusPrice.price.proration_config?.on_increase ||
				OnIncrease.ProrateImmediately,
			onDecrease,
		});
	} else {
		if (prevOverage > 0) {
			newReplaceables = getReplaceables({
				cusEnt,
				prevOverage: prevUsage,
				newOverage: newUsage,
			});

			await RepService.insert({
				ctx,
				data: newReplaceables,
			});
		}
	}

	const numDeletedReplaceables = cusEnt.replaceables.filter(
		(r) => r.delete_next_cycle,
	).length;
	const newQuantity = newUsage - numDeletedReplaceables;

	await stripeCli.subscriptionItems.update(subItem.id, {
		quantity: roundUsage({
			usage: newQuantity,
			price: cusPrice.price,
		}),
		proration_behavior: "none",
	});
	logger.info(`Updated sub item quantity to ${newUsage}`);

	return { invoice, newReplaceables, deletedReplaceables: null };
};
