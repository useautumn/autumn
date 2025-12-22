import { AppEnv, type Organization } from "@autumn/shared";

export const getRevenuecatWebhookSecret = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	return env === AppEnv.Sandbox
		? org.processor_configs?.revenuecat?.sandbox_webhook_secret
		: org.processor_configs?.revenuecat?.webhook_secret;
};
