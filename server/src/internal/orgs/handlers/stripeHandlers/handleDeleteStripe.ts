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
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { createWebhookEndpoint } from "@/external/stripe/stripeOnboardingUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { clearStripeCatalogMappings } from "@/internal/catalog/actions/catalogMappings/clearStripeCatalogMappings.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
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
}) => {
	try {
		await deleteDirectWebhook({ org, env });
	} catch (error) {
		logger.error(`Failed to delete direct webhook for ${org.slug}`, { error });
	}
};

/**
 * Before OAuth is removed: if a secret key is kept whose direct webhook was skipped
 * under OAuth (and none is already stored — that would mean a live webhook predates
 * OAuth), registers one so the org keeps receiving events. Returns its secret.
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

/** Writes only the keys this disconnect owns, so concurrent config changes survive. */
const persistDisconnect = async ({
	db,
	org,
	env,
	clearSecretKey,
	oauthAccountId,
	directWebhookSecret,
	clearCatalogMappings,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	clearSecretKey: boolean;
	oauthAccountId?: string;
	directWebhookSecret?: string;
	clearCatalogMappings: boolean;
}) => {
	const fields = envFields(env);
	const connect = organizations[fields.connect];

	const configPatch: StripeConfig = {
		...(clearSecretKey
			? { [fields.apiKey]: null, [fields.webhookSecret]: null }
			: {}),
		...(directWebhookSecret
			? { [fields.webhookSecret]: directWebhookSecret }
			: {}),
	};
	const hasConfigPatch = Object.keys(configPatch).length > 0;

	await db.transaction(async (tx) => {
		await tx
			.update(organizations)
			.set({
				...(hasConfigPatch && {
					stripe_config: sql`coalesce(${organizations.stripe_config}, '{}'::jsonb) || ${JSON.stringify(configPatch)}::jsonb`,
				}),
				// Leaves a replacement connection made since this request read the org alone.
				...(oauthAccountId && {
					[fields.connect]: sql`case when ${connect}->>'account_id' = ${oauthAccountId} then ${connect} - 'account_id' - 'connected_at' else ${connect} end`,
				}),
			})
			.where(eq(organizations.id, org.id));

		if (clearCatalogMappings) {
			await clearStripeCatalogMappings({
				db: tx as unknown as DrizzleCli,
				orgId: org.id,
				env,
			});
		}
	});
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

		// 2. Run each channel's Stripe side effects
		if (clearSecretKey) await disconnectSecretKey({ org, env, logger });
		const directWebhookSecret = clearOauth
			? await disconnectOauth({
					org,
					env,
					logger,
					secretKeyKept: !clearSecretKey,
				})
			: undefined;

		// 3. Persist (nothing to clear if neither channel was connected for this env)
		const oauthAccountId = clearOauth
			? orgToAccountId({ org, env, noDefaultAccount: true })
			: undefined;
		if (clearSecretKey || clearOauth) {
			await persistDisconnect({
				db,
				org,
				env,
				clearSecretKey,
				oauthAccountId,
				directWebhookSecret,
				clearCatalogMappings,
			});
		}

		// 4. Deauthorize only after the local disconnect is saved, so the revocation
		// webhook finds nothing left to clear and cannot race this write.
		if (oauthAccountId)
			await deauthorizeOauth({ accountId: oauthAccountId, env, logger });

		if (clearCatalogMappings) {
			await invalidateProductsCache({ orgId: org.id, env });
		}

		return c.json({});
	},
});
