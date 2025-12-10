import {
	type Feature,
	type FullCustomerPrice,
	getFeatureInvoiceDescription,
	type OnIncrease,
	type Organization,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import {
	shouldBillNow,
	shouldProrate,
} from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import type { Logger } from "../../external/logtail/logtailUtils";

export const getUpgradeProrationInvoiceItem = ({
	prevPrice,
	newPrice,
	now,
	feature,
	newRoundedUsage,
	price,
	org,
	onIncrease,
	product,
	stripeSub,
	subItem,
	logger,
}: {
	prevPrice: number;
	newPrice: number;
	now: number;
	feature: Feature;
	newRoundedUsage: number;
	price: Price;
	org: Organization;
	onIncrease: OnIncrease;
	product: Product;
	stripeSub: Stripe.Subscription;
	subItem: Stripe.SubscriptionItem;
	logger: Logger;
}) => {
	const billingUnits = (price.config as UsagePriceConfig).billing_units;
	let invoiceAmount = new Decimal(newPrice).minus(prevPrice).toNumber();
	let invoiceDescription = getFeatureInvoiceDescription({
		feature,
		usage: newRoundedUsage,
		billingUnits,
		prodName: product.name,
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
		org,
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
	org,
	cusPrice,
	stripeCli,
	sub,
	subItem,
	newPrice,
	prevPrice,
	newRoundedUsage,
	feature,
	product,
	config,
	onIncrease,
	logger,
}: {
	org: Organization;
	cusPrice: FullCustomerPrice;
	stripeCli: Stripe;
	sub: Stripe.Subscription;
	subItem: Stripe.SubscriptionItem;
	newPrice: number;
	prevPrice: number;
	newRoundedUsage: number;
	feature: Feature;
	product: Product;
	config: UsagePriceConfig;
	onIncrease: OnIncrease;
	logger: Logger;
}) => {
	const now = await getStripeNow({ stripeCli, stripeSub: sub });

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: sub.customer as string,
	});

	const invoiceItem = getUpgradeProrationInvoiceItem({
		prevPrice,
		newPrice,
		now,
		feature,
		newRoundedUsage,
		price: cusPrice.price,
		org,
		onIncrease,
		product,
		stripeSub: sub,
		subItem,
		logger,
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
		const { invoice: finalInvoice } = await createAndFinalizeInvoice({
			stripeCli,
			paymentMethod,
			stripeCusId: sub.customer as string,
			stripeSubId: sub.id,
			logger,
		});

		logger.info(`Paid for invoice ${finalInvoice?.id}`);
		return finalInvoice;
	}

	return null;
};
