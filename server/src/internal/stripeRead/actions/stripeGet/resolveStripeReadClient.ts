import { type AppEnv, type Organization, RecaseError } from "@autumn/shared";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import type { StripeReadClient } from "../../types/stripeReadClient.js";

export const resolveStripeReadClient = ({
	org,
	env,
	createClient = createStripeCli,
}: {
	org: Organization;
	env: AppEnv;
	createClient?: typeof createStripeCli;
}): StripeReadClient => {
	if (isStripeConnected({ org, env, throughSecretKey: true })) {
		return {
			stripe: createClient({ org, env }),
			stripeAccount: undefined,
			platformKeyed: false,
		};
	}

	const accountId = orgToAccountId({ org, env });
	if (!accountId) {
		throw new RecaseError({
			message: "There is no Stripe account linked to this organization.",
		});
	}

	return {
		stripe: createClient({ org, env }),
		stripeAccount: accountId,
		platformKeyed: true,
	};
};
