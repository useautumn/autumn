import type Stripe from "stripe";

const memoizeRetrieve = <Resource>({
	retrieve,
	preloaded,
}: {
	retrieve: (id: string, params?: object) => Promise<Resource>;
	preloaded?: Map<string, Resource>;
}) => {
	const inFlight = new Map<string, Promise<Resource>>();

	return (id: string, params?: object): Promise<Resource> => {
		const swept = preloaded?.get(id);
		if (swept) return Promise.resolve(swept);

		const key = `${id}:${JSON.stringify(params ?? {})}`;
		const cached = inFlight.get(key);
		if (cached) return cached;

		const request = retrieve(id, params);
		inFlight.set(key, request);
		request.catch(() => inFlight.delete(key));
		return request;
	};
};

/** A bulk run re-reads the same few prices for every customer; serving those
 * and the swept schedules from memory keeps it off the org's rate limit. */
export const createBillingVerifyStripeReader = ({
	stripeCli,
	schedulesById,
}: {
	stripeCli: Stripe;
	schedulesById?: Map<string, Stripe.SubscriptionSchedule>;
}): Stripe => {
	const prices = Object.assign(Object.create(stripeCli.prices), {
		retrieve: memoizeRetrieve({
			retrieve: (id, params) => stripeCli.prices.retrieve(id, params),
		}),
	});
	const subscriptionSchedules = Object.assign(
		Object.create(stripeCli.subscriptionSchedules),
		{
			retrieve: memoizeRetrieve({
				retrieve: (id, params) =>
					stripeCli.subscriptionSchedules.retrieve(id, params),
				preloaded: schedulesById,
			}),
		},
	);

	return Object.assign(Object.create(stripeCli), {
		prices,
		subscriptionSchedules,
	});
};
