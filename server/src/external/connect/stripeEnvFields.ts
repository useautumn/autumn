import { AppEnv, type Organization } from "@autumn/shared";

/** Organization fields that hold one environment's Stripe connection. */
export const stripeEnvFields = (env: AppEnv) =>
	env === AppEnv.Sandbox
		? ({
				apiKey: "test_api_key",
				webhookSecret: "test_webhook_secret",
				connect: "test_stripe_connect",
			} as const)
		: ({
				apiKey: "live_api_key",
				webhookSecret: "live_webhook_secret",
				connect: "live_stripe_connect",
			} as const);

export const orgToStripeConnect = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => org[stripeEnvFields(env).connect];
