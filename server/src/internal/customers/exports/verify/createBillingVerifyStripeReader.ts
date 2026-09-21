import type Stripe from "stripe";
import { MAX_MEMOIZED_STRIPE_READS } from "./billingVerifyExportConfig.js";

const memoizeById = <Resource>(retrieve: (id: string) => Promise<Resource>) => {
	const reads = new Map<string, Promise<Resource>>();

	return (id: string): Promise<Resource> => {
		const cached = reads.get(id);
		if (cached) return cached;

		if (reads.size >= MAX_MEMOIZED_STRIPE_READS) reads.clear();
		const read = retrieve(id);
		reads.set(id, read);
		read.catch(() => reads.delete(id));
		return read;
	};
};

/** A bulk run re-reads the same few prices for every customer, and verify reads
 * each schedule twice; one expanded read per id keeps it off the rate limit. */
export const createBillingVerifyStripeReader = ({
	stripeCli,
}: {
	stripeCli: Stripe;
}): Stripe => {
	const prices = Object.assign(Object.create(stripeCli.prices), {
		retrieve: memoizeById((id) =>
			stripeCli.prices.retrieve(id, { expand: ["tiers"] }),
		),
	});
	const subscriptionSchedules = Object.assign(
		Object.create(stripeCli.subscriptionSchedules),
		{
			retrieve: memoizeById((id) =>
				stripeCli.subscriptionSchedules.retrieve(id, {
					expand: ["phases.items.price"],
				}),
			),
		},
	);

	return Object.assign(Object.create(stripeCli), {
		prices,
		subscriptionSchedules,
	});
};
