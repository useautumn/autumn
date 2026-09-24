import type Stripe from "stripe";

const STRIPE_TAX_ID_PAGE_LIMIT = 100;

export const listStripeTaxIds = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}) => {
	const { data } = await stripeCli.customers.listTaxIds(stripeCustomerId, {
		limit: STRIPE_TAX_ID_PAGE_LIMIT,
	});
	return data;
};
