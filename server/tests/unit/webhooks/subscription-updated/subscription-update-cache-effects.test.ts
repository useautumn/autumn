import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import { syncAutumnSubscription } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/syncAutumnSubscription";
import { syncCustomerProductStatus } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/syncCustomerProductStatus/syncCustomerProductStatus";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { SubService } from "@/internal/subscriptions/SubService";

const storedSubscription = {
	id: "subscription_test",
	stripe_id: "sub_test",
	stripe_schedule_id: null,
	created_at: 1000,
	org_id: "org_test",
	env: AppEnv.Sandbox,
	metadata: null,
	usage_features: [],
	current_period_start: 100,
	current_period_end: 200,
	billing_cycle_anchor_seconds: 100,
};
let eventContext: StripeSubscriptionUpdatedContext;
let ctx: StripeWebhookContext;

beforeEach(() => {
	ctx = {
		logger: { warn: () => {} },
		org: { config: {} },
	} as StripeWebhookContext;
	eventContext = {
		stripeSubscription: {
			id: "sub_test",
			status: "active",
			collection_method: "charge_automatically",
			billing_cycle_anchor: 100,
			items: { data: [{ current_period_start: 100, current_period_end: 200 }] },
		},
		fullCustomer: {},
		results: { errors: [] },
		customerProducts: [],
		previousAttributes: {},
		updatedCustomerProducts: [],
	} as unknown as StripeSubscriptionUpdatedContext;
});

afterEach(() => mock.restore());

test("unchanged subscription periods neither write nor require a cache refresh", async () => {
	spyOn(SubService, "getByStripeId").mockResolvedValue(storedSubscription);
	const update = spyOn(SubService, "updateFromStripe").mockResolvedValue(
		storedSubscription,
	);
	await syncAutumnSubscription({
		ctx,
		subscriptionUpdatedContext: eventContext,
	});
	expect(update).not.toHaveBeenCalled();
	expect(eventContext.results.subscription).toBeUndefined();
	expect(eventContext.results.errors).toEqual([]);
});

test.each([
	"current_period_start",
	"current_period_end",
	"billing_cycle_anchor_seconds",
] as const)(
	"a changed subscription %s requires a cache refresh",
	async (field) => {
		spyOn(SubService, "getByStripeId").mockResolvedValue({
			...storedSubscription,
			[field]: 50,
		});
		const update = spyOn(SubService, "updateFromStripe").mockResolvedValue(
			storedSubscription,
		);
		await syncAutumnSubscription({
			ctx,
			subscriptionUpdatedContext: eventContext,
		});
		expect(update).toHaveBeenCalledTimes(1);
		expect(eventContext.results.subscription).toEqual(storedSubscription);
	},
);

test("a missing subscription is not classified as unchanged", async () => {
	spyOn(SubService, "getByStripeId").mockResolvedValue(undefined);
	spyOn(SubService, "updateFromStripe").mockResolvedValue(null);
	await syncAutumnSubscription({
		ctx,
		subscriptionUpdatedContext: eventContext,
	});
	expect(eventContext.results.subscription).toBeNull();
});

test("a failed subscription read is not classified as unchanged", async () => {
	spyOn(SubService, "getByStripeId").mockRejectedValue(
		new Error("read failed"),
	);
	await syncAutumnSubscription({
		ctx,
		subscriptionUpdatedContext: eventContext,
	});
	expect(eventContext.results.errors).toHaveLength(1);
});

test.each([false, true])(
	"status repair requires refresh only when rows changed: %s",
	async (repaired) => {
		spyOn(CusProductService, "updateByStripeSubId").mockResolvedValue(
			repaired
				? [{ id: "cp_test", internal_customer_id: "customer_test" }]
				: [],
		);
		await syncCustomerProductStatus({
			ctx,
			subscriptionUpdatedContext: eventContext,
		});
		expect(eventContext.results.repairedCustomerProducts).toEqual(
			repaired
				? [{ id: "cp_test", internal_customer_id: "customer_test" }]
				: [],
		);
	},
);
