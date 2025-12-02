import type { AppEnv, Organization } from "@autumn/shared";
import type { PaymentProvider } from "@autumn/shared/utils/paymentProviders/types.js";
import type {
	CreateSubscriptionParams,
	UpdateSubscriptionParams,
	CancelSubscriptionParams,
} from "@autumn/shared/utils/paymentProviders/types.js";
import { createPaymentProvider } from "../factory.js";

/**
 * Payment provider-aware subscription utilities
 */
export const createPaymentProviderSubscription = async ({
	org,
	env,
	params,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	params: CreateSubscriptionParams;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.subscriptions.create(params);
};

export const updatePaymentProviderSubscription = async ({
	org,
	env,
	subscriptionId,
	params,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	subscriptionId: string;
	params: UpdateSubscriptionParams;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.subscriptions.update(subscriptionId, params);
};

export const cancelPaymentProviderSubscription = async ({
	org,
	env,
	subscriptionId,
	params,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	subscriptionId: string;
	params?: CancelSubscriptionParams;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.subscriptions.cancel(subscriptionId, params);
};

export const getPaymentProviderSubscription = async ({
	org,
	env,
	subscriptionId,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	subscriptionId: string;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.subscriptions.retrieve(subscriptionId);
};

