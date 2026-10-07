import type Stripe from "stripe";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "@/external/stripe/common/stripeConstants";
import type { createTestWait } from "../../testWait/createTestWait";
import { runStripeClockRequest } from "./runStripeClockRequest";

const DELIVERED_EVENT_TYPES = new Set<string>([
	...MAIN_STRIPE_EVENT_TYPES,
	...SYNC_STRIPE_EVENT_TYPES,
]);

const eventCustomerId = (event: Stripe.Event) => {
	const object = event.data.object as {
		object?: string;
		id?: string;
		customer?: string | { id?: string } | null;
	};
	if (object.object === "customer") return object.id;
	return typeof object.customer === "string"
		? object.customer
		: object.customer?.id;
};

/** Events Autumn's webhook endpoint receives for the clock and its customers, oldest first. */
export const listTestClockEvents = async ({
	stripeCli,
	testClockId,
	customerIds,
	sinceMs,
	wait,
}: {
	stripeCli: Stripe;
	testClockId: string;
	customerIds: Set<string>;
	sinceMs: number;
	wait: ReturnType<typeof createTestWait>;
}): Promise<Stripe.Event[]> => {
	const events = await runStripeClockRequest({
		wait,
		run: () =>
			stripeCli.events
				.list(
					{ created: { gte: Math.floor(sinceMs / 1000) }, limit: 100 },
					{
						timeout: Math.min(10_000, wait.remainingMs()),
						maxNetworkRetries: 0,
					},
				)
				.autoPagingToArray({ limit: 10_000 }),
	});
	return events
		.filter((event) => DELIVERED_EVENT_TYPES.has(event.type))
		.filter((event) => {
			const objectId = (event.data.object as { id?: string }).id;
			const customerId = eventCustomerId(event);
			return (
				objectId === testClockId ||
				(customerId !== undefined && customerIds.has(customerId))
			);
		})
		.reverse();
};
