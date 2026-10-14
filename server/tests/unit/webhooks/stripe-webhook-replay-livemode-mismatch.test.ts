/** Replays queued before the Connect seeder skipped livemode/env mismatches must be dropped. */

import { beforeEach, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	claim: "claimed" as "claimed" | "in_flight" | "unavailable",
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
	"@/external/stripe/webhookReplay/runStripeWebhookReplay.js?livemodeMismatch"
);

const replay = ({ env, livemode }: { env: AppEnv; livemode: boolean }) =>
	runStripeWebhookReplay({
		ctx: {
			id: "request_123",
			org: { id: "org_123" },
			env,
			logger: { info: () => {}, warn: () => {} },
		} as unknown as AutumnContext,
		payload: {
			orgId: "org_123",
			env,
			stripeEvent: {
				id: "evt_checkout",
				type: "checkout.session.completed",
				livemode,
				data: { object: {} },
			} as unknown as Stripe.Event,
			failedAt: Date.now(),
			failureReason: "test",
		},
	});

beforeEach(() => {
	state.handlerRuns = 0;
});

test.each([
	{ env: AppEnv.Live, livemode: false },
	{ env: AppEnv.Sandbox, livemode: true },
])(
	"drops a queued $env replay whose livemode=$livemode",
	async ({ env, livemode }) => {
		await expect(replay({ env, livemode })).resolves.toBeUndefined();
		expect(state.handlerRuns).toBe(0);
	},
);

test("replays an event whose livemode matches its env", async () => {
	await replay({ env: AppEnv.Live, livemode: true });
	expect(state.handlerRuns).toBe(1);
});
