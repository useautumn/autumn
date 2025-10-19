import {
	AppEnv,
	ErrCode,
	InternalError,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import Stripe from "stripe";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { decryptData } from "@/utils/encryptUtils.js";
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

		const decrypted = decryptData(encrypted);
		return new Stripe(decrypted, {
			apiVersion: legacyVersion
				? ("2025-02-24.acacia" as any)
				: "2025-07-30.basil",
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

	throw new InternalError({
		message: `No stripe account linked to organization ${org.id}`,
	});
};
