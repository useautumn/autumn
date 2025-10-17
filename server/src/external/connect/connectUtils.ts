import { AppEnv, type Organization } from "@autumn/shared";

export const orgToAccountId = ({
	org,
	env,
	noDefaultAccount = false,
}: {
	org: Organization;
	env: AppEnv;
	noDefaultAccount?: boolean;
}): string | undefined => {
	if (env === AppEnv.Sandbox) {
		if (noDefaultAccount) {
			return org.stripe_connect?.test_account_id;
		}
		return (
			org.stripe_connect?.test_account_id ||
			org.stripe_connect?.default_account_id
		);
	} else {
		return org.stripe_connect?.live_account_id;
	}
};
