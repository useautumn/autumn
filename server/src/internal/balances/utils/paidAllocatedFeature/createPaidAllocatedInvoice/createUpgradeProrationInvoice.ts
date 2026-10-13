import {
	type Feature,
	type FullCustomerPrice,
	type OnIncrease,
	type Price,
	type Product,
	shouldBillNow,
	shouldProrate,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { stripeSubscriptionToNowMs } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { allocatedSeatsToInvoiceDescription } from "../allocatedSeatsToInvoiceDescription.js";
import { chargeProrationInvoiceNow } from "./chargeProrationInvoiceNow.js";

const getUpgradeProrationInvoiceItem = ({
	ctx,
	prevPrice,
	newPrice,
	now,
	feature,
	newUsage,
	allowance,
	price,
	onIncrease,
	product,
	stripeSub,
	subItem,
}: {
	ctx: AutumnContext;
	prevPrice: number;
	newPrice: number;
	now: number;
	feature: Feature;
	newUsage: number;
	allowance: number;
	price: Price;
	onIncrease: OnIncrease;
	product: Product;
	stripeSub: Stripe.Subscription;
	subItem: Stripe.SubscriptionItem;
}) => {
	const { logger, org } = ctx;

	let invoiceAmount = new Decimal(newPrice).minus(prevPrice).toNumber();
	let invoiceDescription = allocatedSeatsToInvoiceDescription({
		price,
		product,
		feature,
		usage: newUsage,
		allowance,
		currency: org?.default_currency ?? "usd",
	});

	logger.info(`Invoice amount before proration: ${invoiceAmount}`);
	logger.info(`Invoice description: ${invoiceDescription}`);

	if (shouldProrate(onIncrease)) {
		invoiceAmount = calculateProrationAmount({
			periodStart: subItem.current_period_start * 1000,
			periodEnd: subItem.current_period_end * 1000,
			now,
			amount: invoiceAmount,
		});

		const start = formatUnixToDate(now);
		const end = formatUnixToDate(subItem.current_period_end * 1000);

		invoiceDescription = `${invoiceDescription} (from ${start} to ${end})`;
	}

	const invoiceItem = constructStripeInvoiceItem({
		product,
		amount: invoiceAmount,
		ctx,
		price: price,
		description: invoiceDescription,
		stripeSubId: stripeSub.id,
		stripeCustomerId: stripeSub.customer as string,
		periodStart: Math.floor(now / 1000),
		periodEnd: Math.floor(subItem.current_period_end),
	});

	logger.info(`Final invoice item (amount: ${invoiceItem?.amount})`, {
		data: invoiceItem,
	});

	return invoiceItem;
};

export const createUpgradeProrationInvoice = async ({
	ctx,
	cusPrice,
	stripeCli,
	sub,
	subItem,
	newPrice,
	prevPrice,
	newUsage,
	allowance,
	feature,
	product,
	config,
	onIncrease,
}: {
	ctx: AutumnContext;
	cusPrice: FullCustomerPrice;
	stripeCli: Stripe;
	sub: Stripe.Subscription;
	subItem: Stripe.SubscriptionItem;
	newPrice: number;
	prevPrice: number;
	newUsage: number;
	allowance: number;
	feature: Feature;
	product: Product;
	config: UsagePriceConfig;
	onIncrease: OnIncrease;
}) => {
	const { logger } = ctx;
	const now = await stripeSubscriptionToNowMs({
		stripeSubscription: sub,
		stripeCli,
	});

	const invoiceItem = getUpgradeProrationInvoiceItem({
		ctx,
		prevPrice,
		newPrice,
		now,
		feature,
		newUsage,
		allowance,
		price: cusPrice.price,
		onIncrease,
		product,
		stripeSub: sub,
		subItem,
	});

	const invoiceAmount =
		invoiceItem?.amount || invoiceItem?.price_data?.unit_amount || 0;

	const invoiceDescription = invoiceItem?.description || "";

	if (invoiceAmount === 0) return;

	logger.info(
		`🚀 Creating invoice item: ${invoiceDescription} - ${invoiceAmount.toFixed(2)}`,
	);

	await stripeCli.invoiceItems.create(invoiceItem);

	if (shouldBillNow(onIncrease)) {
		const finalInvoice = await chargeProrationInvoiceNow({
			ctx,
			stripeCli,
			sub,
		});
		logger.info(`Paid for invoice ${finalInvoice?.id}`);
		return finalInvoice;
	}

	return null;
};
