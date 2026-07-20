/** Stripe customer sync discovery must consume every subscription and schedule page. */

import { beforeEach, expect, mock, test } from "bun:test";
import type Stripe from "stripe";

const subscriptionList = mock(
	async ({ starting_after: startingAfter }: Stripe.SubscriptionListParams) => ({
		data: [{ id: startingAfter ? "sub_2" : "sub_1" }],
		has_more: !startingAfter,
	}),
);
const scheduleList = mock(
	async ({
		starting_after: startingAfter,
	}: Stripe.SubscriptionScheduleListParams) => ({
		data: [{ id: startingAfter ? "sub_sched_2" : "sub_sched_1" }],
		has_more: !startingAfter,
	}),
);

mock.module("@/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: { list: subscriptionList },
		subscriptionSchedules: { list: scheduleList },
	}),
}));
mock.module(
	"@/internal/billing/v2/providers/stripe/utils/sync/fetchStripeSyncObjects",
	() => ({
		fetchStripeSyncSchedule: async ({
			scheduleId,
		}: {
			scheduleId: string;
		}) => ({
			id: scheduleId,
		}),
	}),
);
mock.module("@/internal/customers/CusService", () => ({
	CusService: {
		getFull: async () => ({ customer_products: [] }),
	},
}));
mock.module("@/internal/products/ProductService", () => ({
	ProductService: { listFull: async () => [] },
}));
mock.module(
	"@/internal/billing/v2/actions/sync/subscriptionToSyncParams",
	() => ({
		subscriptionToSyncParams: async ({
			subscription,
			schedule,
		}: {
			subscription?: Stripe.Subscription;
			schedule?: Stripe.SubscriptionSchedule;
		}) => ({ id: subscription?.id ?? schedule?.id }),
	}),
);

const { prepareAutoSyncStripeCustomer } = await import(
	"@/internal/billing/v2/actions/sync/setup/prepareAutoSyncStripeCustomer"
);

beforeEach(() => {
	subscriptionList.mockClear();
	scheduleList.mockClear();
});

test("prepares candidates from every Stripe page", async () => {
	const candidates = await prepareAutoSyncStripeCustomer({
		ctx: { org: { id: "org_test" }, env: "sandbox", db: {} } as never,
		customerId: "customer_test",
		stripeCustomerId: "cus_test",
	});

	expect(
		(candidates as unknown as { id: string }[]).map(({ id }) => id).sort(),
	).toEqual(["sub_1", "sub_2", "sub_sched_1", "sub_sched_2"].sort());
	expect(subscriptionList).toHaveBeenCalledTimes(2);
	expect(scheduleList).toHaveBeenCalledTimes(2);
});
