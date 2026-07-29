import {
	AppEnv,
	ErrCode,
	type Organization,
	RecaseError,
	Scopes,
	type StripeConfig,
	type StripeConnectConfig,
} from "@autumn/shared";
import { z } from "zod/v4";
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

const envFields = (env: AppEnv) =>
	env === AppEnv.Sandbox
		? ({
				apiKey: "test_api_key",
				webhookSecret: "test_webhook_secret",
				connect: "test_stripe_connect",
			} as const)
		: ({
				apiKey: "live_api_key",
				webhookSecret: "live_webhook_secret",
				connect: "live_stripe_connect",
			} as const);

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

	return {
		clearSecretKey: channel === "oauth" ? false : hasSecretKey,
		clearOauth: channel === "secret_key" ? false : hasOauth,
	};
};

export const computeClearedStripeConfig = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): StripeConfig => {
	const { apiKey, webhookSecret } = envFields(env);
	return {
		...(structuredClone(org.stripe_config) || {}),
		[apiKey]: null,
		[webhookSecret]: null,
	};
};

export const computeClearedStripeConnect = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): StripeConnectConfig => {
	const current = org[envFields(env).connect];
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

/**
 * Registers the direct webhook for a remaining secret key whose webhook was
 * skipped while OAuth covered the org. Returns the encrypted secret, or null.
 */
export const reRegisterDirectWebhook = async ({
	org,
	env,
	logger,
}: {
	org: Organization;
	env: AppEnv;
	logger: Logger;
}): Promise<string | null> => {
	const encryptedKey = org.stripe_config?.[envFields(env).apiKey];
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

const disconnectSecretKey = async ({
	org,
	env,
	logger,
}: {
	org: Organization;
	env: AppEnv;
	logger: Logger;
}): Promise<Partial<Organization>> => {
	try {
		await deleteDirectWebhook({ org, env });
	} catch (error) {
		logger.error(`Failed to delete direct webhook for ${org.slug}`, { error });
	}
	return { stripe_config: computeClearedStripeConfig({ org, env }) };
};

/**
 * Disconnects OAuth: clears the connect account and deauthorizes it. If a secret
 * key is kept whose direct webhook was skipped under OAuth (and none is already
 * stored — that would mean a live webhook predates OAuth), registers one first so
 * the org keeps receiving events.
 */
const disconnectOauth = async ({
	org,
	env,
	logger,
	secretKeyKept,
}: {
	org: Organization;
	env: AppEnv;
	logger: Logger;
	secretKeyKept: boolean;
}): Promise<Partial<Organization>> => {
	const fields = envFields(env);
	const updates: Partial<Organization> = {
		[fields.connect]: computeClearedStripeConnect({ org, env }),
	};

	const needsDirectWebhook =
		secretKeyKept &&
		!org.stripe_config?.[fields.webhookSecret] &&
		isStripeConnected({ org, env, throughSecretKey: true });

	if (needsDirectWebhook) {
		const webhookSecret = await reRegisterDirectWebhook({ org, env, logger });
		if (!webhookSecret) {
			throw new RecaseError({
				message:
					"Couldn't register a direct webhook for your secret key, so OAuth was not disconnected. Please try again.",
				code: ErrCode.StripeError,
				statusCode: 502,
			});
		}
		updates.stripe_config = {
			...(org.stripe_config || {}),
			[fields.webhookSecret]: webhookSecret,
		};
	}

	// Only after a successful re-register (above) — never leave the org with no
	// working webhook if registration failed.
	try {
		await deauthorizeOauth({ org, env, logger });
	} catch (error) {
		logger.error(`Failed to deauthorize oauth for ${org.slug}`, { error });
	}

	return updates;
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

		// 1. Resolve which channels to disconnect
		const { clearSecretKey, clearOauth } = resolveDisconnectChannels({
			org,
			env,
			channel,
		});

		// 2. Disconnect each channel, collecting the org updates it produces
		const updates: Partial<Organization> = {};
		if (clearSecretKey) {
			Object.assign(updates, await disconnectSecretKey({ org, env, logger }));
		}
		if (clearOauth) {
			Object.assign(
				updates,
				await disconnectOauth({
					org,
					env,
					logger,
					secretKeyKept: !clearSecretKey,
				}),
			);
		}

		// 3. Persist (nothing to clear if neither channel was connected for this env)
		if (Object.keys(updates).length > 0) {
			await OrgService.update({ db, orgId: org.id, updates });
		}

		return c.json({});
	},
});
