import { StripeSync } from "@supabase/stripe-sync-engine";
import type Stripe from "stripe";
import { eventTypeToTable } from "./eventTypeToTable.js";

const SCHEMA = "stripe";

let instance: StripeSync | null = null;
let initAttempted = false;

/**
 * Lazily creates a singleton StripeSync instance.
 * Returns null if STRIPE_SYNC_DATABASE_URL is not configured or init fails.
 */
export const getStripeSyncEngine = (): StripeSync | null => {
	if (instance) return instance;
	if (initAttempted) return null;

	initAttempted = true;

	const databaseUrl = process.env.STRIPE_SYNC_DATABASE_URL;
	const stripeSecretKey =
		process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SANDBOX_SECRET_KEY;

	if (!databaseUrl || !stripeSecretKey) return null;

	try {
		instance = new StripeSync({
			poolConfig: {
				connectionString: databaseUrl,
				max: 5,
				keepAlive: true,
				connectionTimeoutMillis: 5_000,
				idleTimeoutMillis: 30_000,
			},
			stripeSecretKey,
			stripeWebhookSecret: "unused-processEvent-only",
			schema: SCHEMA,
		});
	} catch {
		instance = null;
	}

	return instance;
};

/**
 * Upserts the Stripe event into the sync DB, then stamps the row
 * with the originating Stripe account ID and org ID for multi-tenancy.
 * Fully fail-open: any error is swallowed and returns silently.
 */
export const processStripeSyncEvent = async ({
	event,
	stripeAccountId,
	orgId,
}: {
	event: Stripe.Event;
	stripeAccountId?: string;
	orgId?: string;
}): Promise<void> => {
	const engine = getStripeSyncEngine();
	if (!engine) return;

	try {
		await engine.processEvent(event);
	} catch {
		return;
	}

	const table = eventTypeToTable({ eventType: event.type });
	if (!table) return;

	const objectId = (event.data.object as { id?: string }).id;
	if (!objectId) return;

	const accountId = stripeAccountId ?? event.account ?? null;

	if (!accountId && !orgId) return;

	try {
		await engine.postgresClient.pool.query(
			`UPDATE "${SCHEMA}"."${table}" SET stripe_account_id = COALESCE($1, stripe_account_id), org_id = COALESCE($2, org_id) WHERE id = $3`,
			[accountId, orgId, objectId],
		);
	} catch {
		// Fail-open: metadata stamp is best-effort
	}
};

/** Gracefully close the sync engine's PG pool (call on server shutdown). */
export const closeStripeSyncEngine = async (): Promise<void> => {
	if (!instance) return;
	try {
		await instance.close();
	} catch {
		// Best-effort cleanup
	}
	instance = null;
	initAttempted = false;
};
