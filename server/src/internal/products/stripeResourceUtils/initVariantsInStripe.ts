import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initProductInStripe } from "../productUtils.js";
import { applyStripeReuseFromVariantFamilies } from "./applyStripeReuseFromVariantFamilies.js";

/**
 * Inits created variants' Stripe resources: family reuse first, then one
 * product at a time so siblings can't double-create a shared price.
 */
export const initVariantsInStripe = async ({
	ctx,
	products,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
}): Promise<void> => {
	if (products.length === 0) return;

	await applyStripeReuseFromVariantFamilies({ ctx, products });
	for (const product of products) {
		await initProductInStripe({ ctx, product });
	}
};
