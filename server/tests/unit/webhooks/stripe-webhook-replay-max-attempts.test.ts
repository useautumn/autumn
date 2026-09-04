import { beforeEach, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	claim: "claimed" as "claimed" | "in_flight",
	handlerError: null as Error | null,
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
			if (state.handlerError) throw state.handlerError;
		},
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware.js",
	() => ({
		buildStripeWebhookEventKey: () => "stripe_webhook_event:test",
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
	"@/external/stripe/webhookReplay/runStripeWebhookReplay.js?maxAttempts"
);

const replay = ({ receiveCount }: { receiveCount: number }) =>
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
			stripeEvent: {
				id: "evt_123",
				type: "checkout.session.completed",
			} as Stripe.Event,
			failedAt: Date.now(),
			failureReason: "test",
		},
		receiveCount,
	});

beforeEach(() => {
	state.claim = "claimed";
	state.handlerError = new Error("duplicate key value violates unique constraint");
});

test("rethrows handler errors before the attempt cap", async () => {
	await expect(replay({ receiveCount: 29 })).rejects.toThrow("duplicate key");
});

test("ACKs a still-failing replay at the attempt cap", async () => {
	await expect(replay({ receiveCount: 30 })).resolves.toBeUndefined();
});
