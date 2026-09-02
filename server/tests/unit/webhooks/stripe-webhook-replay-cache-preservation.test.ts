/** Replay cleanup must preserve a FullSubject atomically published by a deferred handler. */

import { beforeEach, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	cacheDeletions: 0,
	flushBalances: undefined as boolean | undefined,
	handlerRuns: 0,
	preservePublishedSubject: false,
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({}),
}));

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({
		deleteCachedFullCustomer: async (args: { flushBalances?: boolean }) => {
			state.cacheDeletions++;
			state.flushBalances = args.flushBalances;
		},
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/runStripeWebhookHandlers.js",
	() => ({
		runStripeWebhookHandlers: async ({ ctx }: { ctx: AutumnContext }) => {
			state.handlerRuns++;
			ctx.skipSubjectCacheDeletion = state.preservePublishedSubject;
		},
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware.js",
	() => ({
		buildStripeWebhookEventKey: () => "stripe_webhook_event:test",
		claimStripeWebhookEvent: async () => "claimed",
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
		attachStripeEventCustomer: async ({ ctx }: { ctx: AutumnContext }) => ({
			...ctx,
			fullCustomer: { id: "customer_123" },
		}),
	}),
);

const { runStripeWebhookReplay } = await import(
	// @ts-expect-error - Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookReplay/runStripeWebhookReplay.js?cachePreservation"
);

beforeEach(() => {
	state.cacheDeletions = 0;
	state.flushBalances = undefined;
	state.handlerRuns = 0;
	state.preservePublishedSubject = false;
});

test("preserves a FullSubject published while replaying the webhook", async () => {
	state.preservePublishedSubject = true;
	const ctx = {
		id: "request_123",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		skipCache: true,
		logger: {
			info: mock(() => {}),
		},
	} as unknown as AutumnContext;
	const stripeEvent = {
		id: "evt_123",
		type: "checkout.session.completed",
		data: { object: {} },
	} as Stripe.Event;

	await runStripeWebhookReplay({
		ctx,
		payload: {
			orgId: "org_123",
			env: AppEnv.Sandbox,
			stripeEvent,
			failedAt: Date.now(),
			failureReason: "test replay",
		},
	});

	expect(state.handlerRuns).toBe(1);
	expect(state.cacheDeletions).toBe(0);
});

test("keeps the normal replay cleanup when nothing published a subject", async () => {
	const ctx = {
		id: "request_123",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		skipCache: true,
		logger: {
			info: mock(() => {}),
		},
	} as unknown as AutumnContext;
	const stripeEvent = {
		id: "evt_123",
		type: "invoice.updated",
		data: { object: {} },
	} as Stripe.Event;

	await runStripeWebhookReplay({
		ctx,
		payload: {
			orgId: "org_123",
			env: AppEnv.Sandbox,
			stripeEvent,
			failedAt: Date.now(),
			failureReason: "test replay",
		},
	});

	expect(state.handlerRuns).toBe(1);
	expect(state.cacheDeletions).toBe(1);
	expect(state.flushBalances).toBe(true);
});
