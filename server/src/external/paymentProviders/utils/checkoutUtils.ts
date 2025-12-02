import type { AppEnv, Organization } from "@autumn/shared";
import type { PaymentProvider } from "@autumn/shared/utils/paymentProviders/types.js";
import type { CreateCheckoutSessionParams } from "@autumn/shared/utils/paymentProviders/types.js";
import { createPaymentProvider } from "../factory.js";

/**
 * Payment provider-aware checkout utilities
 */
export const createPaymentProviderCheckoutSession = async ({
	org,
	env,
	params,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	params: CreateCheckoutSessionParams;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.checkout.createSession(params);
};

