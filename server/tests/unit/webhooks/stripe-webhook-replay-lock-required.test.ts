/**
 * The SQS replay path takes the same Redis event claim as the HTTP path. For
 * events that must never run concurrently (cycle invoice.created), an
 * "unavailable" claim must be treated like "in flight": retry later instead
 * of running unlocked next to a Stripe redelivery.
 */

import { beforeEach, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	claim: "unavailable" as "claimed" | "in_flight" | "unavailable",
	handlerRuns: 0,
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({}),
}));

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({ deleteCachedFullCustomer: async () => {} }),
);

await mockModuleWithRestore(
	"@/external/stripe/runStripeWebhookHandlers.js",
	() => ({
		runStripeWebhookHandlers: async () => {
			state.handlerRuns++;
		},
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware.js",
	() => ({
		buildStripeWebhookEventKey: () => "stripe_webhook_event:test",
		newStripeWebhookLockToken: () => "token",
		startStripeWebhookLockRenewal: () => () => {},
		claimStripeWebhookEvent: async () => state.claim,
		completeStripeWebhookEvent: async () => {},
		releaseStripeWebhookEvent: async () => {},
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/webhookMiddlewares/stripeSyncMiddleware.js",
	() => ({ syncStripeEventToSyncDb: () => {} }),
);

await mockModuleWithRestore(
	"@/external/stripe/webhookMiddlewares/stripeToAutumnCustomerMiddleware.js",
	() => ({
		attachStripeEventCustomer: async ({ ctx }: { ctx: AutumnContext }) => ctx,
	}),
);

const { runStripeWebhookReplay } = await import(
	// @ts-expect-error - Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookReplay/runStripeWebhookReplay.js?lockRequired"
);

const replay = ({
	stripeEvent,
	receiveCount = 1,
}: {
	stripeEvent: Stripe.Event;
	receiveCount?: number;
}) =>
	runStripeWebhookReplay({
		ctx: {
			id: "request_123",
			org: { id: "org_123" },
			env: AppEnv.Sandbox,
			logger: { info: () => {} },
		} as unknown as AutumnContext,
		payload: {
			orgId: "org_123",
			env: AppEnv.Sandbox,
			stripeEvent,
			failedAt: Date.now(),
			failureReason: "test",
		},
		receiveCount,
	});

const cycleInvoiceCreated = {
	id: "evt_cycle",
	type: "invoice.created",
	data: { object: { billing_reason: "subscription_cycle" } },
} as unknown as Stripe.Event;

const checkoutCompleted = {
	id: "evt_checkout",
	type: "checkout.session.completed",
	data: { object: {} },
} as unknown as Stripe.Event;

beforeEach(() => {
	state.claim = "unavailable";
	state.handlerRuns = 0;
});

test("retries a lock-required replay later instead of running it unlocked", async () => {
	await expect(replay({ stripeEvent: cycleInvoiceCreated })).rejects.toThrow(
		"in flight",
	);
	expect(state.handlerRuns).toBe(0);
});

test("still fails open for other events when Redis is unavailable", async () => {
	await expect(
		replay({ stripeEvent: checkoutCompleted }),
	).resolves.toBeUndefined();
	expect(state.handlerRuns).toBe(1);
});

test("runs a lock-required replay once the claim succeeds", async () => {
	state.claim = "claimed";
	await expect(
		replay({ stripeEvent: cycleInvoiceCreated }),
	).resolves.toBeUndefined();
	expect(state.handlerRuns).toBe(1);
});
