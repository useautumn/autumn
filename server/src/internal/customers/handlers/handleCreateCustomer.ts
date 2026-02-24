import type { Customer, FullProduct } from "@autumn/shared";
import type { Stripe } from "stripe";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";

export const initStripeCusAndProducts = async ({
	ctx,
	customer,
	products,
}: {
	ctx: AutumnContext;
	customer: Customer;
	products: FullProduct[];
}) => {
	const batchInit: Promise<Stripe.Customer | undefined>[] = [
		getOrCreateStripeCustomer({
			ctx,
			customer,
		}),
	];

	for (const product of products) {
		batchInit.push(
			initProductInStripe({
				ctx,
				product,
			}),
		);
	}

	await Promise.all(batchInit);
};
