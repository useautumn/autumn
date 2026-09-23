import { AppEnv, type Organization } from "@autumn/shared";

export const stripeConnectField = (env: AppEnv) =>
	env === AppEnv.Live ? "live_stripe_connect" : "test_stripe_connect";

export const orgToStripeConnect = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => org[stripeConnectField(env)];
