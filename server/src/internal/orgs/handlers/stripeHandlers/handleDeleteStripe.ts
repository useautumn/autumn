import {
	AppEnv,
	ErrCode,
	type Organization,
	organizations,
	RecaseError,
	Scopes,
	type StripeConfig,
	type StripeConnectConfig,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { LOCK_HELD_STRIPE_REQUEST_OPTIONS } from "@/external/stripe/common/stripeConstants.js";
import { createWebhookEndpoint } from "@/external/stripe/stripeOnboardingUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { clearStripeCatalogMappings } from "@/internal/catalog/actions/catalogMappings/clearStripeCatalogMappings.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
import { OrgService } from "../../OrgService.js";
import { clearOrgCache } from "../../orgUtils/clearOrgCache.js";
import { lockStripeOAuthAccount } from "../../orgUtils/lockStripeOAuthAccount.js";
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

	const clearSecretKey = channel === "oauth" ? false : hasSecretKey;
	const clearOauth = channel === "secret_key" ? false : hasOauth;
	const clearCatalogMappings =
		(clearSecretKey || clearOauth) &&
		(!hasSecretKey || clearSecretKey) &&
		(!hasOauth || clearOauth);

	return { clearSecretKey, clearOauth, clearCatalogMappings };
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
	delete newConnect.connected_at;
	return newConnect;
};

/** Rereads the Stripe fields under a row lock so writes apply to current config, not a cached org. */
const lockOrgStripeFields = async ({
	db,
	org,
}: {
	db: DrizzleCli;
	org: Organization;
}): Promise<Organization> => {
	const [current] = await db
		.select({
			stripe_config: organizations.stripe_config,
			test_stripe_connect: organizations.test_stripe_connect,
			live_stripe_connect: organizations.live_stripe_connect,
		})
		.from(organizations)
		.where(eq(organizations.id, org.id))
		.for("update");
	return { ...org, ...current };
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
	accountId,
	env,
	logger,
}: {
	accountId: string;
	env: AppEnv;
	logger: Logger;
}) => {
	const masterStripe = initMasterStripe({ env });
	try {
		await masterStripe.oauth.deauthorize(
			{
				client_id:
					env === AppEnv.Live
						? process.env.STRIPE_LIVE_CLIENT_ID || ""
						: process.env.STRIPE_SANDBOX_CLIENT_ID || "",
				stripe_user_id: accountId,
			},
			LOCK_HELD_STRIPE_REQUEST_OPTIONS,
		);
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
}) => {
	try {
		await deleteDirectWebhook({ org, env });
	} catch (error) {
		logger.error(`Failed to delete direct webhook for ${org.slug}`, { error });
	}
};

/**
 * Before OAuth is removed, registers a direct webhook for a kept secret key that has none,
 * so the org keeps receiving events. Returns the encrypted secret to store, if any.
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
}): Promise<string | undefined> => {
	const fields = envFields(env);
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
		return webhookSecret;
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

		// 1. Resolve which channels to disconnect
		const { clearSecretKey, clearOauth, clearCatalogMappings } =
			resolveDisconnectChannels({
				org,
				env,
				channel,
			});

		// 2. Run each channel's Stripe side effects before persisting
		if (clearSecretKey) await disconnectSecretKey({ org, env, logger });
		const directWebhookSecret = clearOauth
			? await disconnectOauth({
					org,
					env,
					logger,
					secretKeyKept: !clearSecretKey,
				})
			: undefined;

		// 3. Persist key-level changes onto the locked row (nothing to do if no channel was connected)
		const oauthAccountId = clearOauth
			? orgToAccountId({ org, env, noDefaultAccount: true })
			: undefined;
		if (clearSecretKey || clearOauth) {
			await db.transaction(async (tx) => {
				const txDb = tx as unknown as DrizzleCli;
				// Deauthorizing under the account lock keeps the deauthorization webhook from racing this write.
				if (oauthAccountId)
					await lockStripeOAuthAccount({ tx, env, accountId: oauthAccountId });
				const current = await lockOrgStripeFields({ db: txDb, org });
				const fields = envFields(env);
				const stripeConfig = clearSecretKey
					? computeClearedStripeConfig({ org: current, env })
					: directWebhookSecret
						? { ...(current.stripe_config || {}) }
						: undefined;
				if (stripeConfig && directWebhookSecret)
					stripeConfig[fields.webhookSecret] = directWebhookSecret;
				await OrgService.update({
					db: txDb,
					orgId: org.id,
					updates: {
						...(stripeConfig ? { stripe_config: stripeConfig } : {}),
						...(clearOauth
							? {
									[fields.connect]: computeClearedStripeConnect({
										org: current,
										env,
									}),
								}
							: {}),
					},
				});
				if (clearCatalogMappings) {
					await clearStripeCatalogMappings({
						db: txDb,
						orgId: org.id,
						env,
					});
				}
				// Only after a successful re-register (above), so the org keeps a working webhook.
				if (oauthAccountId)
					await deauthorizeOauth({ accountId: oauthAccountId, env, logger });
			});
		}

		if (clearCatalogMappings) {
			await invalidateProductsCache({ orgId: org.id, env });
		}

		return c.json({});
	},
});
