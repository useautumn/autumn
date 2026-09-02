import type { ApiPriceProcessors } from "@api/products/components/processors";

type StripePriceConfigSlots = {
	stripe_product_id?: string | null;
	stripe_price_id?: string | null;
	stripe_prepaid_price_v2_id?: string | null;
} | null;

export const priceConfigToPriceProcessors = ({
	config,
}: {
	config?: StripePriceConfigSlots;
}): ApiPriceProcessors | undefined => {
	const priceId =
		config?.stripe_prepaid_price_v2_id || config?.stripe_price_id || undefined;
	if (!priceId) return undefined;
	return { stripe: { price_id: priceId } };
};
