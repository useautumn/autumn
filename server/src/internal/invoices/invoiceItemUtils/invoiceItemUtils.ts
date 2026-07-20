import {
	atmnToStripeAmount,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const constructStripeInvoiceItem = ({
	ctx,
	product,
	amount,
	price,
	description,
	stripeSubId,
	stripeCustomerId,
	periodStart,
	periodEnd,
}: {
	ctx: AutumnContext;
	product: Product;
	amount: number;
	price: Price;
	description: string;
	stripeSubId: string;
	stripeCustomerId: string;
	periodStart: number;
	periodEnd: number;
	currency?: string;
}) => {
	const { org } = ctx;
	const config = price.config as UsagePriceConfig;

	const invoiceCurrency = currency || org.default_currency || "usd";

	const amountInCents = atmnToStripeAmount({
		amount,
		currency: invoiceCurrency,
	});

	const priceData =
		amountInCents > 0
			? {
					price_data: {
						unit_amount: amountInCents,
						currency: invoiceCurrency,
						product: config.stripe_product_id || (product.processor?.id ?? ""),
					},
				}
			: {
					amount: amountInCents,
					currency: invoiceCurrency,
				};

	const invoiceItem: Stripe.InvoiceItemCreateParams = {
		subscription: stripeSubId,
		...priceData,

		description,
		customer: stripeCustomerId,
		period: {
			start: periodStart,
			end: periodEnd,
		},
	};

	return invoiceItem;
};
