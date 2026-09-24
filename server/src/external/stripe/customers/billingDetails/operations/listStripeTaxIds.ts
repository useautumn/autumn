import type Stripe from "stripe";

const STRIPE_TAX_ID_PAGE_LIMIT = 100;
const MAX_TAX_IDS = 1000;

export const listStripeTaxIds = ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}) =>
	stripeCli.customers
		.listTaxIds(stripeCustomerId, { limit: STRIPE_TAX_ID_PAGE_LIMIT })
		.autoPagingToArray({ limit: MAX_TAX_IDS });
