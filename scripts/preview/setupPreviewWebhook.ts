import "dotenv/config";
import { WEBHOOK_EVENTS } from "@server/utils/constants.js";
import { encryptData } from "@server/utils/encryptUtils.js";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Stripe from "stripe";
import { TEST_ORG_CONFIG } from "../setupTestUtils/createTestOrg.js";

const main = async () => {
	const serverUrl = process.env.SERVER_URL;
	const orgId = process.env.TESTS_ORG_ID || TEST_ORG_CONFIG.id;
	const stripeSecretKey = process.env.STRIPE_SANDBOX_SECRET_KEY;
	const databaseUrl = process.env.DATABASE_URL;

	if (!serverUrl) throw new Error("SERVER_URL not set");
	if (!stripeSecretKey) throw new Error("STRIPE_SANDBOX_SECRET_KEY not set");
	if (!databaseUrl) throw new Error("DATABASE_URL not set");

	const stripe = new Stripe(stripeSecretKey);

	// Webhook URL includes org_id query param (used by stripeConnectSeederMiddleware)
	const webhookUrl = `${serverUrl}/webhooks/connect/sandbox?org_id=${orgId}`;

	// Check if webhook already exists for this URL
	const existing = await stripe.webhookEndpoints.list();
	const existingWebhook = existing.data.find(
		(webhook) => webhook.url === webhookUrl,
	);

	if (existingWebhook) {
		console.log(`Webhook already exists: ${existingWebhook.id}`);
		return;
	}

	// Create webhook endpoint
	const webhook = await stripe.webhookEndpoints.create({
		url: webhookUrl,
		enabled_events:
			WEBHOOK_EVENTS as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
		connect: true,
	});

	console.log(`Created webhook: ${webhook.id}`);

	// Update test org's CONNECT webhook secret in database
	// This is read by getConnectWebhookSecret() in initStripeCli.ts
	const db = drizzle(postgres(databaseUrl));

	if (!webhook.secret) throw new Error("Webhook secret not returned by Stripe");
	const encryptedSecret = encryptData(webhook.secret);

	await db.execute(sql`
    UPDATE organizations
    SET stripe_config = jsonb_set(
      COALESCE(stripe_config, '{}'),
      '{test_connect_webhook_secret}',
      ${JSON.stringify(encryptedSecret)}::jsonb
    )
    WHERE id = ${orgId}
  `);

	console.log(`Connect webhook secret updated for org ${orgId}`);
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Setup failed:", error);
		process.exit(1);
	});
