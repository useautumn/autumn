import {
	AppEnv,
	InternalError,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { decryptData } from "@server/utils/encryptUtils.js";
import "dotenv/config";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import Stripe from "stripe";
import { getConnectWebhookSecret } from "./connectUtils.js";

export const initMasterStripe = (params?: {
	accountId?: string;
	legacyVersion?: boolean;
	env?: AppEnv;
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

	// if (!params) {
	// 	return new Stripe(secretKey);
	// }

	return new Stripe(secretKey, {
		stripeAccount: params?.accountId,
		apiVersion: params?.legacyVersion
			? ("2025-02-24.acacia" as any)
			: undefined,
	});
};

export const initPlatformStripe = ({
	masterOrg,
	env,
	accountId,
	legacyVersion,
}: {
	masterOrg: Organization | null;
	env: AppEnv;
	accountId?: string;
	legacyVersion?: boolean;
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

	const decrypted = decryptData(encrypted);
	if (!decrypted) {
		throw new InternalError({
			message: `Failed to decrypt master organization's Stripe secret key`,
		});
	}

	return new Stripe(decrypted, {
		stripeAccount: accountId || undefined,
		apiVersion: legacyVersion ? ("2025-02-24.acacia" as any) : undefined,
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
