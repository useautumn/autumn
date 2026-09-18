import type Stripe from "stripe";

export const retrieveLiveStripeProduct = async ({
	stripeCli,
	productId,
}: {
	stripeCli: Stripe;
	productId?: string | null;
}): Promise<Stripe.Product | null> => {
	if (!productId) return null;

	try {
		const product = await stripeCli.products.retrieve(productId);
		if (product.active) return product;
		return await stripeCli.products.update(product.id, { active: true });
	} catch {
		return null;
	}
};
