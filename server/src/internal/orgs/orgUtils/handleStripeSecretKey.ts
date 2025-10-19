import { AppEnv } from "@autumn/shared";
import Stripe from "stripe";
import {
	checkKeyValid,
	createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";

export const handleStripeSecretKey = async ({
	orgId,
	secretKey,
	env,
}: {
	orgId: string;
	secretKey: string;
	env: AppEnv;
}) => {
	// 1. Check if key is valid
	await checkKeyValid(secretKey);
	const stripe = new Stripe(secretKey);
	const account = await stripe.accounts.retrieve();

	// 2. Disconnect existing webhook endpoints
	const curWebhooks = await stripe.webhookEndpoints.list();
	for (const webhook of curWebhooks.data) {
		if (webhook.url.includes(orgId) && webhook.url.includes(env)) {
			await stripe.webhookEndpoints.del(webhook.id);
		}
	}

	// 3. Create new webhook endpoint
	const webhook = await createWebhookEndpoint(secretKey, env, orgId);

	// 3. Return encrypted
	if (env === AppEnv.Sandbox) {
		return {
			test_api_key: encryptData(secretKey),
			test_webhook_secret: encryptData(webhook.secret as string),
			env,
			defaultCurrency: account.default_currency,
			metadata: {
				org_id: orgId,
				env: env,
			},
		};
	} else {
		return {
			live_api_key: encryptData(secretKey),
			live_webhook_secret: encryptData(webhook.secret as string),
			env,
			defaultCurrency: account.default_currency,
			metadata: {
				org_id: orgId,
				env: env,
			},
		};
	}
};
