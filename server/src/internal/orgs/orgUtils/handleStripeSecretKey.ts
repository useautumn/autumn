import {
	AppEnv,
	ErrCode,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import Stripe from "stripe";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { logger } from "@/external/logtail/logtailUtils";
import {
	checkKeyValid,
	createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";

export const handleStripeSecretKey = async ({
	orgId,
	secretKey,
	env,
	org,
}: {
	orgId: string;
	secretKey: string;
	env: AppEnv;
	org?: Organization;
}) => {
	// 1. Check if key is valid
	await checkKeyValid(secretKey);
	const stripe = new Stripe(secretKey);
	const account = await stripe.accounts.retrieve();

	// Both channels must point at the same Stripe account, else OAuth webhooks
	// (account B) would be processed against secret-key billing state (account A).
	const oauthAccountId = org
		? orgToAccountId({ org, env, noDefaultAccount: true })
		: undefined;

	if (oauthAccountId && oauthAccountId !== account.id) {
		throw new RecaseError({
			message: `This Stripe secret key belongs to account ${account.id}, but your OAuth connection is account ${oauthAccountId}. Both must be the same Stripe account. Disconnect OAuth first, or use a key from ${oauthAccountId}.`,
			code: ErrCode.StripeAccountMismatch,
			statusCode: 400,
		});
	}

	// Always clear stale direct endpoints on the org's own account. When OAuth is
	// connected its master connect webhook covers the org, so we must NOT also keep
	// or create a direct webhook (it would double-deliver).
	const curWebhooks = await stripe.webhookEndpoints.list();
	for (const existing of curWebhooks.data) {
		if (existing.url.includes(orgId) && existing.url.includes(env)) {
			await stripe.webhookEndpoints.del(existing.id);
		}
	}

	const oauthConnected = Boolean(oauthAccountId);
	let webhook: Stripe.WebhookEndpoint | null = null;
	if (!oauthConnected) {
		try {
			webhook = await createWebhookEndpoint(secretKey, env, orgId);
		} catch (error) {
			logger.error("Error creating webhook endpoint:", error);
		}
	}

	// 3. Return encrypted
	if (env === AppEnv.Sandbox) {
		return {
			test_api_key: encryptData(secretKey),
			test_webhook_secret: webhook
				? encryptData(webhook.secret as string)
				: null,
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
			live_webhook_secret: webhook
				? encryptData(webhook.secret as string)
				: null,
			env,
			defaultCurrency: account.default_currency,
			metadata: {
				org_id: orgId,
				env: env,
			},
		};
	}
};
