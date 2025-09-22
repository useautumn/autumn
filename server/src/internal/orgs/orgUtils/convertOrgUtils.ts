import { AppEnv, Organization } from "@autumn/shared";

export const toSuccessUrl = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	if (env === AppEnv.Sandbox) {
		return org.stripe_config?.sandbox_success_url || "https://useautumn.com";
	} else {
		return org.stripe_config?.success_url || "https://useautumn.com";
	}
};
