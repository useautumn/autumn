import {
	AppEnv,
	ErrCode,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { isStripeConnected } from "@server/internal/orgs/orgUtils.js";
import { decryptData } from "@server/utils/encryptUtils.js";
import { instrumentStripe } from "@server/utils/otel/instrumentStripe.js";
import Stripe from "stripe";
import { buildSecretKeyCacheKey } from "./clientCache/cacheKeyUtils.js";
import { getOrCreateStripeClient } from "./clientCache/stripeClientCache.js";
import { orgToAccountId, shouldUseMaster } from "./connectUtils.js";
import { initMasterStripe, initPlatformStripe } from "./initStripeCli.js";

export const createStripeCli = ({
	org,
	env,
	legacyVersion,
	throughSecretKey = false,
}: {
	org: Organization;
	env: AppEnv;
	legacyVersion?: boolean;
	throughSecretKey?: boolean;
}) => {
	// Try secret key first.
	if (isStripeConnected({ org, env, throughSecretKey: true })) {
		// Secret key flow
		const encrypted =
			env === AppEnv.Sandbox
				? org.stripe_config?.test_api_key
				: org.stripe_config?.live_api_key;

		if (!encrypted) {
			throw new RecaseError({
				message: `Please connect your Stripe ${env === AppEnv.Sandbox ? "test" : "live"} secret key. You can find it here: https://dashboard.stripe.com${env === AppEnv.Sandbox ? "/test" : ""}/apikeys`,
				code: ErrCode.StripeConfigNotFound,
				statusCode: 400,
			});
		}

		const cacheKey = buildSecretKeyCacheKey({
			orgId: org.id,
			env,
			legacyVersion,
			encryptedKey: encrypted,
		});

		return getOrCreateStripeClient({
			cacheKey,
			create: () => {
				const decrypted = decryptData(encrypted);
				return instrumentStripe({
					client: new Stripe(decrypted, {
						apiVersion: legacyVersion
							? // biome-ignore lint/suspicious/noExplicitAny: Need to cast to any to avoid type error
								("2025-02-24.acacia" as any)
							: undefined,
					}),
				});
			},
		});
	}

	// Then try account ID
	const accountId = orgToAccountId({ org, env });

	if (accountId && !throughSecretKey) {
		// Check if this org has a master_org_id (platform flow)
		const useMaster = shouldUseMaster({ org, env });
		if (useMaster) {
			return initPlatformStripe({
				masterOrg: org.master,
				env,
				accountId,
				legacyVersion,
			});
		}

		// Standard flow - use Autumn's master Stripe keys
		return initMasterStripe({ accountId, legacyVersion, env });
	}

	throw new RecaseError({
		message: `There is no Stripe account linked to this organization. Please connect it here: https://app.useautumn.com${env === AppEnv.Sandbox ? "/sandbox" : ""}/dev?tab=stripe`,
	});
};
