import { AppEnv, type Organization, type SharedContext } from "@autumn/shared";

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

export const orgDisableStripeWrites = ({
	ctx,
	includeSandbox = false,
}: {
	ctx: SharedContext;
	includeSandbox?: boolean;
}) => {
	if (ctx.env === AppEnv.Sandbox && !includeSandbox) {
		return false;
	}
	return ctx.org.config.disable_stripe_writes;
};
