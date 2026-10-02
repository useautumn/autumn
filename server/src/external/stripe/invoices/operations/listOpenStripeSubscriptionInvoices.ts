import type Stripe from "stripe";

const INVOICES_PER_PAGE = 100;

export const listOpenStripeSubscriptionInvoices = async ({
	stripeCli,
	stripeSubscriptionId,
}: {
	stripeCli: Stripe;
	stripeSubscriptionId: string;
}): Promise<Stripe.Invoice[]> => {
	const openInvoices: Stripe.Invoice[] = [];
	let startingAfter: string | undefined;

	while (true) {
		const page = await stripeCli.invoices.list({
			subscription: stripeSubscriptionId,
			status: "open",
			limit: INVOICES_PER_PAGE,
			starting_after: startingAfter,
		});
		openInvoices.push(...page.data);

		startingAfter = page.data.at(-1)?.id;
		if (!page.has_more || !startingAfter) return openInvoices;
	}
};
