import type { Price, Product, UsagePriceConfig } from "@autumn/shared";
import { Decimal } from "decimal.js";
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
}) => {
	const { org } = ctx;
	const config = price.config as UsagePriceConfig;

	const amountInCents = Math.floor(
		new Decimal(amount).mul(100).round().toNumber(),
	);

	const priceData =
		amountInCents > 0
			? {
					price_data: {
						unit_amount: amountInCents,
						currency: org.default_currency || "usd",
						product: config.stripe_product_id || (product.processor?.id ?? ""),
					},
				}
			: {
					amount: amountInCents,
					currency: org.default_currency || "usd",
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
