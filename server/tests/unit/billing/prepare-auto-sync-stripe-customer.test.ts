import { beforeEach, expect, mock, test } from "bun:test";
import type Stripe from "stripe";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const subscriptionList = mock(() => ({
	autoPagingToArray: async () => [{ id: "sub_1" }, { id: "sub_2" }],
}));
const scheduleList = mock(() => ({
	autoPagingToArray: async () => [{ id: "sub_sched_1" }, { id: "sub_sched_2" }],
}));

await mockModuleWithRestore("@/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: { list: subscriptionList },
		subscriptionSchedules: { list: scheduleList },
	}),
}));
await mockModuleWithRestore(
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
await mockModuleWithRestore("@/internal/customers/CusService", () => ({
	CusService: { getFull: async () => ({ customer_products: [] }) },
}));
await mockModuleWithRestore("@/internal/products/ProductService", () => ({
	ProductService: { listFull: async () => [] },
}));
await mockModuleWithRestore(
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

test("prepares all Stripe subscriptions and schedules", async () => {
	const candidates = await prepareAutoSyncStripeCustomer({
		ctx: { org: { id: "org_test" }, env: "sandbox", db: {} } as never,
		customerId: "customer_test",
		stripeCustomerId: "cus_test",
	});

	expect(
		(candidates as unknown as { id: string }[]).map(({ id }) => id).sort(),
	).toEqual(["sub_1", "sub_2", "sub_sched_1", "sub_sched_2"].sort());
});
