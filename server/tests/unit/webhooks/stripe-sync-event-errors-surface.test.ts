/**
 * A failed write to the Stripe mirror must never reject (the webhook path is
 * fail-open), but it must be reported so it can be logged.
 *
 * Red (before): processStripeSyncEvent swallowed every error with no report,
 *               so the mirror could lose rows with no log line at all.
 * Green (after): it still resolves, and hands the error to `onError`.
 */
import { beforeAll, expect, mock, test } from "bun:test";
import type Stripe from "stripe";

const processEvent = mock(async () => {
	throw new Error("mirror write failed");
});

// Resolved from the package that imports it, so the mock replaces its copy.
const syncEnginePath = Bun.resolveSync(
	"@supabase/stripe-sync-engine",
	new URL("../../../../packages/stripe-sync/src/", import.meta.url).pathname,
);

mock.module(syncEnginePath, () => ({
	runMigrations: mock(async () => {}),
	StripeSync: class {
		processEvent = processEvent;
		postgresClient = { pool: { query: mock(async () => ({})) } };
		close = mock(async () => {});
	},
}));

beforeAll(() => {
	process.env.STRIPE_SYNC_DATABASE_URL = "postgres://mirror.invalid/sync";
	process.env.STRIPE_SANDBOX_SECRET_KEY = "sk_test_unit";
});

test("processStripeSyncEvent resolves on a failed mirror write and reports it", async () => {
	const { processStripeSyncEvent } = await import("@autumn/stripe-sync");
	const onError = mock();

	await expect(
		processStripeSyncEvent({
			event: {
				id: "evt_unit",
				type: "customer.subscription.updated",
				data: { object: { id: "sub_unit" } },
			} as unknown as Stripe.Event,
			stripeAccountId: "acct_unit",
			orgId: "org_unit",
			env: "sandbox",
			onError,
		}),
	).resolves.toBeUndefined();

	expect(onError).toHaveBeenCalledTimes(1);
	expect(onError.mock.calls[0]?.[0]).toMatchObject({
		message: "mirror write failed",
	});
});
