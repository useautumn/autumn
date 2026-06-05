import { AppEnv, type Organization } from "@autumn/shared";

/** Random 64-char alphanumeric secret RevenueCat echoes back in the Authorization header. */
export const generateRevenuecatWebhookSecret = (): string => {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	const randomBytes = crypto.getRandomValues(new Uint8Array(64));
	for (let i = 0; i < 64; i++) {
		result += chars[randomBytes[i] % chars.length];
	}
	return result;
};

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
