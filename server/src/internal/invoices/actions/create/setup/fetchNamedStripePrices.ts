import { type CreateInvoiceParams, ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice";

export type NamedStripePrices = Map<string, Stripe.Price>;

const namedPriceIds = ({
	params,
}: {
	params: CreateInvoiceParams;
}): string[] => {
	const ids = (params.plans ?? []).flatMap((plan) => [
		plan.customize?.price?.processors?.stripe?.price_id,
		...(plan.customize?.items ?? []).map(
			(item) => item.price?.processors?.stripe?.price_id,
		),
		...(plan.license_quantities ?? []).flatMap((license) => [
			license.customize?.price?.processors?.stripe?.price_id,
			...(license.customize?.items ?? []).map(
				(item) => item.price?.processors?.stripe?.price_id,
			),
		]),
	]);
	return [...new Set(ids.filter((id): id is string => Boolean(id)))];
};

export const fetchNamedStripePrices = async ({
	stripeCli,
	params,
	currency,
}: {
	stripeCli: Stripe;
	params: CreateInvoiceParams;
	currency: string;
}): Promise<NamedStripePrices> => {
	const ids = namedPriceIds({ params });
	if (ids.length === 0) return new Map();

	const prices = await Promise.all(
		ids.map(async (id) => {
			const price = await getStripePrice({
				stripeClient: stripeCli,
				stripePriceId: id,
				expand: ["tiers"],
			});
			if (!price) {
				throw new RecaseError({
					message: `Stripe price ${id} not found`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			return price;
		}),
	);

	for (const price of prices) {
		if (price.currency !== currency) {
			throw new RecaseError({
				message: `Stripe price ${price.id} is in ${price.currency}, but this invoice is in ${currency}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	return new Map(prices.map((price) => [price.id, price]));
};
