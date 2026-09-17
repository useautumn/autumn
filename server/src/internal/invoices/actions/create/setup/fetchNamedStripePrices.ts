import { type CreateInvoiceParams, ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

/** Every Stripe price the request named, keyed by id. */
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
		...(plan.license_quantities ?? []).map(
			(license) => license.customize?.price?.processors?.stripe?.price_id,
		),
	]);
	return [...new Set(ids.filter((id): id is string => Boolean(id)))];
};

/**
 * Loads the Stripe prices the request named, so the preview is computed from
 * the same configuration Stripe bills from. Tiers are expanded because a
 * tiered price's amount is unknowable without them.
 */
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
			try {
				return await stripeCli.prices.retrieve(id, { expand: ["tiers"] });
			} catch {
				throw new RecaseError({
					message: `Stripe price ${id} not found`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
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
