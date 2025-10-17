import {
	AppEnv,
	ErrCode,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import Stripe from "stripe";
import { decryptData } from "@/utils/encryptUtils.js";
import { orgToAccountId } from "./connectUtils.js";
import { initMasterStripe } from "./initMasterStripe.js";

export const createStripeCli = ({
	org,
	env,
	// apiVersion,
	legacyVersion,
}: {
	org: Organization;
	env: AppEnv;
	// apiVersion?: string;
	legacyVersion?: boolean;
}) => {
	// Look at test account flow first
	const accountId = orgToAccountId({ org, env });

	if (accountId) return initMasterStripe({ accountId, legacyVersion });

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
};
