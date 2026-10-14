import { StripeSync } from "@supabase/stripe-sync-engine";
import type Stripe from "stripe";
import { eventTypeToTable } from "./eventTypeToTable.js";

const SCHEMA = "stripe";

let instance: StripeSync | null = null;
let initAttempted = false;

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

export const processStripeSyncEvent = async ({
	event,
	stripeAccountId,
	orgId,
	env,
	onError,
}: {
	event: Stripe.Event;
	stripeAccountId?: string;
	orgId?: string;
	env?: string;
	onError?: (error: unknown) => void;
}): Promise<void> => {
	const engine = getStripeSyncEngine();
	if (!engine) return;

	try {
		await engine.processEvent(event);
	} catch (error) {
		onError?.(error);
		return;
	}

	const table = eventTypeToTable({ eventType: event.type });
	if (!table) return;

	const objectId = (event.data.object as { id?: string }).id;
	if (!objectId) return;

	const accountId = stripeAccountId ?? event.account ?? null;

	if (!accountId && !orgId && !env) return;

	try {
		await engine.postgresClient.pool.query(
			`UPDATE "${SCHEMA}"."${table}" SET stripe_account_id = COALESCE($1, stripe_account_id), org_id = COALESCE($2, org_id), env = COALESCE($3, env) WHERE id = $4`,
			[accountId, orgId, env, objectId],
		);
	} catch (error) {
		onError?.(error);
	}
};

export const closeStripeSyncEngine = async (): Promise<void> => {
	if (!instance) return;
	try {
		await instance.close();
	} catch {}
	instance = null;
	initAttempted = false;
};
