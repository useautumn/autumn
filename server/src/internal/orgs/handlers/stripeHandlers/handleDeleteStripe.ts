import {
	AppEnv,
	type Organization,
	Scopes,
	type StripeConfig,
	type StripeConnectConfig,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createWebhookEndpoint } from "@/external/stripe/stripeOnboardingUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
import { OrgService } from "../../OrgService.js";
import { clearOrgCache } from "../../orgUtils/clearOrgCache.js";
import { isStripeConnected } from "../../orgUtils.js";

export type DisconnectChannel = "secret_key" | "oauth";

export const resolveDisconnectChannels = ({
	org,
	env,
	channel,
}: {
	org: Organization;
	env: AppEnv;
	channel?: DisconnectChannel;
}) => {
	const hasSecretKey = isStripeConnected({ org, env, throughSecretKey: true });
	const hasOauth = Boolean(
		orgToAccountId({ org, env, noDefaultAccount: true }),
	);

	if (channel === "secret_key") {
		return { clearSecretKey: hasSecretKey, clearOauth: false };
	}
	if (channel === "oauth") {
		return { clearSecretKey: false, clearOauth: hasOauth };
	}
	return { clearSecretKey: hasSecretKey, clearOauth: hasOauth };
};

export const computeClearedStripeConfig = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): StripeConfig => {
	const newStripeConfig: any = structuredClone(org.stripe_config) || {};
	if (env === AppEnv.Sandbox) {
		newStripeConfig.test_api_key = null;
		newStripeConfig.test_webhook_secret = null;
	} else {
		newStripeConfig.live_api_key = null;
		newStripeConfig.live_webhook_secret = null;
	}
	return newStripeConfig;
};

export const computeClearedStripeConnect = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): StripeConnectConfig => {
	const current =
		env === AppEnv.Sandbox ? org.test_stripe_connect : org.live_stripe_connect;
	const newConnect: StripeConnectConfig = structuredClone(current) || {};
	delete newConnect.account_id;
	return newConnect;
};

const deleteDirectWebhook = async ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	if (!isStripeConnected({ org, env, throughSecretKey: true })) return;

	const stripeCli = createStripeCli({ org, env, throughSecretKey: true });
	const webhooks = await stripeCli.webhookEndpoints.list();
	for (const webhook of webhooks.data) {
		if (webhook.url.includes(org.id) && webhook.url.includes(env)) {
			await stripeCli.webhookEndpoints.del(webhook.id);
		}
	}
};

const deauthorizeOauth = async ({
	org,
	env,
	logger,
}: {
	org: Organization;
	env: AppEnv;
	logger: Logger;
}) => {
	const accountId = orgToAccountId({ org, env, noDefaultAccount: true });
	if (!accountId) return;

	const masterStripe = initMasterStripe({ env });
	try {
		await masterStripe.oauth.deauthorize({
			client_id:
				env === AppEnv.Live
					? process.env.STRIPE_LIVE_CLIENT_ID || ""
					: process.env.STRIPE_SANDBOX_CLIENT_ID || "",
			stripe_user_id: accountId,
		});
	} catch (error) {
		logger.error("Failed to deauthorize account:", error);
	}
};

// When OAuth went away but a secret key remains, that key's direct webhook may
// never have been registered (it's skipped while OAuth covers the org). Register
// it now so the org keeps receiving events. Returns the encrypted webhook secret.
export const reRegisterDirectWebhook = async ({
	org,
	env,
	logger,
}: {
	org: Organization;
	env: AppEnv;
	logger: Logger;
}): Promise<string | null> => {
	const encryptedKey =
		env === AppEnv.Sandbox
			? org.stripe_config?.test_api_key
			: org.stripe_config?.live_api_key;
	if (!encryptedKey) return null;

	try {
		const webhook = await createWebhookEndpoint(
			decryptData(encryptedKey),
			env,
			org.id,
		);
		return encryptData(webhook.secret as string);
	} catch (error) {
		logger.error(`Failed to re-register direct webhook for ${org.slug}`, {
			error,
		});
		return null;
	}
};

export const handleDeleteStripe = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: z
		.object({
			channel: z.enum(["secret_key", "oauth"]).optional(),
		})
		.optional(),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger, env } = ctx;
		const channel = c.req.valid("json")?.channel;

		await clearOrgCache({ db, orgId: org.id, logger });

		const { clearSecretKey, clearOauth } = resolveDisconnectChannels({
			org,
			env,
			channel,
		});

		if (clearSecretKey) {
			try {
				await deleteDirectWebhook({ org, env });
			} catch (error) {
				logger.error(`Failed to delete direct webhook for ${org.slug}`, {
					error,
				});
			}
			await OrgService.update({
				db,
				orgId: org.id,
				updates: { stripe_config: computeClearedStripeConfig({ org, env }) },
			});
		}

		if (clearOauth) {
			try {
				await deauthorizeOauth({ org, env, logger });
			} catch (error) {
				logger.error(`Failed to deauthorize oauth for ${org.slug}`, { error });
			}

			const clearedConnect = computeClearedStripeConnect({ org, env });
			const updates: Partial<Organization> =
				env === AppEnv.Sandbox
					? { test_stripe_connect: clearedConnect }
					: { live_stripe_connect: clearedConnect };

			// Secret key kept but its direct webhook was skipped under OAuth — register
			// it now. Skip when a webhook secret is already stored: that means a live
			// direct webhook predates OAuth, and re-registering would orphan it.
			const existingWebhookSecret =
				env === AppEnv.Sandbox
					? org.stripe_config?.test_webhook_secret
					: org.stripe_config?.live_webhook_secret;
			if (
				!clearSecretKey &&
				!existingWebhookSecret &&
				isStripeConnected({ org, env, throughSecretKey: true })
			) {
				const webhookSecret = await reRegisterDirectWebhook({
					org,
					env,
					logger,
				});
				if (webhookSecret) {
					const prefix = env === AppEnv.Sandbox ? "test" : "live";
					updates.stripe_config = {
						...(org.stripe_config || {}),
						[`${prefix}_webhook_secret`]: webhookSecret,
					};
				}
			}

			await OrgService.update({ db, orgId: org.id, updates });
		}

		return c.json({});
	},
});
