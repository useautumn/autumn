import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyStripeResourceReuseForProduct } from "./applyStripeResourceReuseForProduct.js";
import { applyStripeReuseFromVariantFamilies } from "./applyStripeReuseFromVariantFamilies.js";

/**
 * Applies Stripe resource reuse to created variants: family reuse first, then
 * one product at a time so siblings see ids copied onto earlier products.
 */
export const applyStripeReuseForVariants = async ({
	ctx,
	products,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
}): Promise<void> => {
	if (products.length === 0) return;

	await applyStripeReuseFromVariantFamilies({ ctx, products });
	for (const product of products) {
		await applyStripeResourceReuseForProduct({ ctx, product });
	}
};
