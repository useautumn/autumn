import type Stripe from "stripe";
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
 * evict itself. */
const boundedRead = <T>({
	resource,
	id,
	run,
}: {
	resource: string;
	id: string;
	run: () => Promise<T>;
}) => {
	const { pageTimeoutMs, pageAttempts, retryDelayMs } =
		billingVerifyExportConfig.sweep;
	return retryBoundedAsync({
		attempts: pageAttempts,
		delayMs: retryDelayMs,
		timeoutMs: pageTimeoutMs,
		timeoutMessage: `Stripe ${resource} ${id} timed out after ${pageTimeoutMs}ms`,
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
	const prices = Object.assign(Object.create(stripeCli.prices), {
		retrieve: memoizeById((id) =>
			boundedRead({
				resource: "price",
				id,
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
