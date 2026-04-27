import {
	AppEnv,
	InternalError,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { decryptData } from "@server/utils/encryptUtils.js";
import { instrumentStripe } from "@server/utils/otel/instrumentStripe.js";
import "dotenv/config";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import Stripe from "stripe";
import {
	buildMasterCacheKey,
	buildPlatformCacheKey,
} from "./clientCache/cacheKeyUtils.js";
import { getOrCreateStripeClient } from "./clientCache/stripeClientCache.js";
import { getConnectWebhookSecret } from "./connectUtils.js";

export const initMasterStripe = (params?: {
	accountId?: string;
	legacyVersion?: boolean;
	env?: AppEnv;
	skipInstrumentation?: boolean;
}) => {
	let secretKey: string;

	if (params?.env === AppEnv.Live) {
		if (!process.env.STRIPE_LIVE_SECRET_KEY) {
			throw new InternalError({
				message: "STRIPE_LIVE_SECRET_KEY env variable is not set",
			});
		}
		secretKey = process.env.STRIPE_LIVE_SECRET_KEY;
	} else {
		if (!process.env.STRIPE_SANDBOX_SECRET_KEY) {
			throw new InternalError({
				message: "STRIPE_SANDBOX_SECRET_KEY env variable is not set",
			});
		}
		secretKey = process.env.STRIPE_SANDBOX_SECRET_KEY;
	}

	const cacheKey = buildMasterCacheKey({
		env: params?.env,
		accountId: params?.accountId,
		legacyVersion: params?.legacyVersion,
		secretKey,
	});

	return getOrCreateStripeClient({
		cacheKey,
		create: () => {
			const client = new Stripe(secretKey, {
				stripeAccount: params?.accountId,
				apiVersion: params?.legacyVersion
					? ("2025-02-24.acacia" as any)
					: undefined,
			});
			return params?.skipInstrumentation ? client : instrumentStripe({ client });
		},
	});
};

export const initPlatformStripe = ({
	masterOrg,
	env,
	accountId,
	legacyVersion,
	skipInstrumentation = false,
}: {
	masterOrg: Organization | null;
	env: AppEnv;
	accountId?: string;
	legacyVersion?: boolean;
	skipInstrumentation?: boolean;
}) => {
	if (!masterOrg) {
		throw new InternalError({
			message: "Master organization is undefined in initPlatformStripe",
		});
	}

	// Get master org's secret key and validate access to the account
	const encrypted =
		env === AppEnv.Sandbox
			? masterOrg.stripe_config?.test_api_key
			: masterOrg.stripe_config?.live_api_key;

	if (!encrypted) {
		const envLabel = env === AppEnv.Sandbox ? "test" : "live";
		throw new RecaseError({
			message: `Master organization must have Stripe ${envLabel} secret key connected`,
		});
	}

	const cacheKey = buildPlatformCacheKey({
		masterOrgId: masterOrg.id,
		env,
		accountId,
		legacyVersion,
		encryptedKey: encrypted,
	});

	return getOrCreateStripeClient({
		cacheKey,
		create: () => {
			const decrypted = decryptData(encrypted);
			if (!decrypted) {
				throw new InternalError({
					message: "Failed to decrypt master organization's Stripe secret key",
				});
			}

			const client = new Stripe(decrypted, {
				stripeAccount: accountId || undefined,
				apiVersion: legacyVersion ? ("2025-02-24.acacia" as any) : undefined,
			});
			return skipInstrumentation ? client : instrumentStripe({ client });
		},
	});
};

export const getStripeWebhookSecret = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId?: string;
	env: AppEnv;
}) => {
	// If org ID...
	if (orgId) {
		return await getConnectWebhookSecret({ db, orgId, env });
	}

	let secret: string;
	if (env === AppEnv.Live) {
		secret = process.env.STRIPE_LIVE_WEBHOOK_SECRET || "";
	} else {
		secret = process.env.STRIPE_SANDBOX_WEBHOOK_SECRET || "";
	}

	if (!secret) {
		throw new InternalError({
			message: `STRIPE_WEBHOOK_SECRET env variable is not set (${env})`,
		});
	}

	return secret;
};
