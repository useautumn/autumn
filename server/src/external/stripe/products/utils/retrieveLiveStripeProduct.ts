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
		return product.active ? product : null;
	} catch {
		return null;
	}
};
