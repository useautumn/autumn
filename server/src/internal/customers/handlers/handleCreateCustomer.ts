import type { Customer, FullProduct } from "@autumn/shared";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers";
import { applyStripeResourceReuseForProduct } from "@/internal/products/stripeResourceUtils/applyStripeResourceReuseForProduct.js";
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
	await Promise.all([
		getOrCreateStripeCustomer({
			ctx,
			customer,
		}),
		...products.map((product) =>
			applyStripeResourceReuseForProduct({ ctx, product }),
		),
	]);
};
