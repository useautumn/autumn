import type Stripe from "stripe";
import { createRatePacer, type RatePacer } from "@/utils/createRatePacer.js";
import { retryBoundedAsync } from "@/utils/retryBoundedAsync.js";
import { billingVerifyExportConfig } from "./billingVerifyExportConfig.js";

const memoizeById = <Resource>(retrieve: (id: string) => Promise<Resource>) => {
	const reads = new Map<string, Promise<Resource>>();

	return (id: string): Promise<Resource> => {
		const cached = reads.get(id);
		if (cached) return cached;

		if (reads.size >= billingVerifyExportConfig.stripeReader.maxMemoizedReads)
			reads.clear();
		const read = retrieve(id);
		reads.set(id, read);
		read.catch(() => reads.delete(id));
		return read;
	};
};

/** A memoized read caches the pending promise, so an unbounded one that stalls
 * would be handed to every later customer; the deadline lets it reject and
 * evict itself in time for the customer's own retry to start a fresh read. */
const boundedRead = <T>({
	resource,
	id,
	run,
	pacer,
}: {
	resource: string;
	id: string;
	run: () => Promise<T>;
	pacer: RatePacer;
}) => {
	const { timeoutMs, attempts } = billingVerifyExportConfig.stripeReader;
	return retryBoundedAsync({
		attempts,
		delayMs: 0,
		timeoutMs,
		timeoutMessage: `Stripe ${resource} ${id} timed out after ${timeoutMs}ms`,
		beforeAttempt: () => pacer.takeSlot(),
		run,
	});
};

/** A bulk run re-reads the same few prices for every customer, and verify reads
 * each schedule twice; one expanded read per id keeps it off the rate limit. */
export const createBillingVerifyStripeReader = ({
	stripeCli,
}: {
	stripeCli: Stripe;
}): Stripe => {
	const pacer = createRatePacer({
		requestsPerSecond: billingVerifyExportConfig.stripeReader.requestsPerSecond,
	});
	const prices = Object.assign(Object.create(stripeCli.prices), {
		retrieve: memoizeById((id) =>
			boundedRead({
				resource: "price",
				id,
				pacer,
				run: () => stripeCli.prices.retrieve(id, { expand: ["tiers"] }),
			}),
		),
	});
	const subscriptionSchedules = Object.assign(
		Object.create(stripeCli.subscriptionSchedules),
		{
			retrieve: memoizeById((id) =>
				boundedRead({
					resource: "subscription schedule",
					id,
					pacer,
					run: () =>
						stripeCli.subscriptionSchedules.retrieve(id, {
							expand: ["phases.items.price"],
						}),
				}),
			),
		},
	);

	return Object.assign(Object.create(stripeCli), {
		prices,
		subscriptionSchedules,
	});
};
