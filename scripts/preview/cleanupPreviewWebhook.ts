import "dotenv/config";
import Stripe from "stripe";

const main = async () => {
	const serverUrl = process.env.SERVER_URL;
	const orgId = process.env.TESTS_ORG_ID;
	const stripeSecretKey = process.env.STRIPE_SANDBOX_SECRET_KEY;

	if (!serverUrl || !orgId) {
		console.log("SERVER_URL or TESTS_ORG_ID not set, skipping cleanup");
		return;
	}

	if (!stripeSecretKey) {
		console.log("STRIPE_SANDBOX_SECRET_KEY not set, skipping cleanup");
		return;
	}

	const stripe = new Stripe(stripeSecretKey);
	const webhookUrl = `${serverUrl}/webhooks/connect/sandbox?org_id=${orgId}`;

	// Find and delete the webhook
	const existing = await stripe.webhookEndpoints.list();
	const webhook = existing.data.find(
		(webhookEndpoint) => webhookEndpoint.url === webhookUrl,
	);

	if (webhook) {
		await stripe.webhookEndpoints.del(webhook.id);
		console.log(`Deleted webhook: ${webhook.id}`);
	} else {
		console.log("No matching webhook found to delete");
	}
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Cleanup failed:", error);
		process.exit(1);
	});
