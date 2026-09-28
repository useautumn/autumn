import { beforeEach, describe, expect, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { shouldRefreshAfterWebhookHandler } from "@/external/stripe/webhookMiddlewares/stripeWebhookRefreshMiddleware";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore";

let eventContext: StripeSubscriptionUpdatedContext;
let pooledRuns = 0;

await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/setupStripeSubscriptionUpdatedContext",
	() => ({ setupStripeSubscriptionUpdatedContext: async () => eventContext }),
);
await mockModuleWithRestore(
	"@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions",
	() => ({
		applyPooledBalanceCustomerProductTransitions: async () => {
			pooledRuns++;
			return eventContext.fullCustomer;
		},
	}),
);

for (const [path, name] of [
	["syncAutumnSubscription", "syncAutumnSubscription"],
	[
		"syncCustomerProductStatus/syncCustomerProductStatus",
		"syncCustomerProductStatus",
	],
	["autoSyncUpdatedSubscription", "autoSyncUpdatedSubscription"],
	["handleCancelOnPastDue", "handleCancelOnPastDue"],
	["handleIgnorePastDue", "handleIgnorePastDue"],
	[
		"handleSchedulePhaseChanges/handleSchedulePhaseChanges",
		"handleSchedulePhaseChanges",
	],
	[
		"handleStripeSubscriptionCanceled/handleStripeSubscriptionCanceled",
		"handleStripeSubscriptionCanceled",
	],
	[
		"handleStripeSubscriptionRenewed/handleStripeSubscriptionRenewed",
		"handleStripeSubscriptionRenewed",
	],
	[
		"handleStripeSubscriptionTrialEnded/handleStripeSubscriptionTrialEnded",
		"handleStripeSubscriptionTrialEnded",
	],
] as const) {
	await mockModuleWithRestore(
		`@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/${path}`,
		() => ({ [name]: async () => {} }),
	);
}

await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	emitBillingChangeWebhook: () => {},
	logCustomerProductUpdates: () => {},
}));

const { handleStripeSubscriptionUpdated } = await import(
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/handleStripeSubscriptionUpdated"
);

const runHandler = async ({ autumnOriginated = true } = {}) => {
	const event = {
		type: "customer.subscription.updated",
		request: autumnOriginated
			? { id: "req_test", idempotency_key: "autumn:billing:test" }
			: null,
	} as Stripe.CustomerSubscriptionUpdatedEvent;
	const ctx = { stripeEvent: event } as StripeWebhookContext;
	await handleStripeSubscriptionUpdated({ ctx, event });
	return ctx;
};

beforeEach(() => {
	pooledRuns = 0;
	eventContext = {
		fullCustomer: { pooled_customer_entitlements: [] },
		results: { errors: [] },
		updatedCustomerProducts: [],
		insertedCustomerProducts: [],
		deletedCustomerProducts: [],
	} as unknown as StripeSubscriptionUpdatedContext;
});

describe("subscription update cache preservation", () => {
	test("preserves an unchanged Autumn echo without entering the pooled flush", async () => {
		const ctx = await runHandler();
		expect(pooledRuns).toBe(0);
		expect(ctx.handlerResult?.context).toBe(eventContext);
		expect(ctx.skipSubjectCacheDeletion).not.toBe(true);
		expect(shouldRefreshAfterWebhookHandler({ ctx })).toBe(false);
	});

	test.each(["updated", "inserted", "deleted"] as const)(
		"does not preserve cache when the event context has %s products",
		async (mutation) => {
			const product = {
				id: "cp_test",
				status: CusProductStatus.Active,
			} as FullCusProduct;
			if (mutation === "updated") {
				eventContext.updatedCustomerProducts.push({
					customerProduct: product,
					updates: { trial_ends_at: 123 },
				});
			} else if (mutation === "inserted") {
				eventContext.insertedCustomerProducts.push(product);
			} else {
				eventContext.deletedCustomerProducts.push(product);
			}
			const ctx = await runHandler();
			expect(shouldRefreshAfterWebhookHandler({ ctx })).toBe(true);
			if (mutation === "inserted") expect(pooledRuns).toBe(1);
		},
	);

	test("keeps pooled lifecycle processing for Autumn echoes with existing pools", async () => {
		eventContext.fullCustomer.pooled_customer_entitlements = [
			{},
		] as NonNullable<
			StripeSubscriptionUpdatedContext["fullCustomer"]["pooled_customer_entitlements"]
		>;
		const ctx = await runHandler();
		expect(pooledRuns).toBe(1);
		expect(shouldRefreshAfterWebhookHandler({ ctx })).toBe(true);
	});

	test("keeps the existing external-event lifecycle and refresh behavior", async () => {
		const ctx = await runHandler({ autumnOriginated: false });
		expect(pooledRuns).toBe(1);
		expect(shouldRefreshAfterWebhookHandler({ ctx })).toBe(true);
	});

	test.each([
		{ subscription: null },
		{
			repairedCustomerProducts: [
				{ id: "cp_test", internal_customer_id: "customer_test" },
			],
		},
		{
			autoSync: {} as NonNullable<
				StripeSubscriptionUpdatedContext["results"]["autoSync"]
			>,
		},
		{ stripeSubscription: { id: "sub_test" } as Stripe.Subscription },
		{ errors: [new Error("task failed")] },
	])(
		"does not preserve cache for recorded task results: %j",
		async (results) => {
			Object.assign(eventContext.results, results);
			const ctx = await runHandler();
			expect(shouldRefreshAfterWebhookHandler({ ctx })).toBe(true);
		},
	);
});
