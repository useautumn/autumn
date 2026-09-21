/**
 * A failed write to the Stripe mirror must reach the caller, whose `.catch`
 * logs it. The webhook stays fail-open because the caller never awaits it.
 *
 * Red (before): processStripeSyncEvent swallowed every error, so the mirror
 *               could lose rows with no log line at all.
 * Green (after): the error rejects out of processStripeSyncEvent.
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

test("processStripeSyncEvent rejects when the mirror write fails", async () => {
	const { processStripeSyncEvent } = await import("@autumn/stripe-sync");

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
		}),
	).rejects.toThrow("mirror write failed");
	expect(processEvent).toHaveBeenCalledTimes(1);
});
