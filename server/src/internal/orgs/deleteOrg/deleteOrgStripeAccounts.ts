import { AppEnv, type Organization } from "@autumn/shared";
import {
	deauthorizeAccount,
	deleteConnectedAccount,
} from "@/external/connect/connectUtils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";

export const deleteOrgStripeAccounts = async ({
	org,
	logger,
}: {
	org: Organization;
	logger: Logger;
}) => {
	if (org.test_stripe_connect?.account_id) {
		await deauthorizeAccount({
			accountId: org.test_stripe_connect.account_id,
			env: AppEnv.Sandbox,
			logger,
		});
	}

	if (org.live_stripe_connect?.account_id) {
		await deauthorizeAccount({
			accountId: org.live_stripe_connect.account_id,
			env: AppEnv.Live,
			logger,
		});
	}

	if (org.test_stripe_connect?.default_account_id) {
		await deleteConnectedAccount({
			accountId: org.test_stripe_connect.default_account_id,
			env: AppEnv.Sandbox,
			logger,
		});
	}
};
