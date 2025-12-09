import type { AppEnv, Organization } from "@autumn/shared";
import { ProcessorType } from "@autumn/shared/utils/paymentProviders/types.js";
import type { PaymentProvider } from "@autumn/shared/utils/paymentProviders/types.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { StripeProvider } from "./stripe/StripeProvider.js";

/**
 * Creates a payment provider instance based on organization configuration
 * 
 * Currently supports Stripe. Future providers can be added here.
 * 
 * @param org - Organization configuration
 * @param env - Environment (sandbox or live)
 * @param options - Additional options for provider creation
 * @returns Payment provider instance
 */
export const createPaymentProvider = ({
	org,
	env,
	legacyVersion,
	providerType,
}: {
	org: Organization;
	env: AppEnv;
	legacyVersion?: boolean;
	providerType?: ProcessorType;
}): PaymentProvider => {
	// If provider type is explicitly specified, use it
	const type = providerType || getDefaultProviderType({ org, env });

	switch (type) {
		case ProcessorType.Stripe:
			return new StripeProvider({ org, env, legacyVersion });

		default:
			throw new Error(
				`Unsupported payment provider type: ${type}. Organization: ${org.id}, Env: ${env}`,
			);
	}
};

/**
 * Determines the default payment provider type for an organization
 * 
 * Currently defaults to Stripe if connected. In the future, this could check
 * organization configuration to determine the preferred provider.
 */
const getDefaultProviderType = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): ProcessorType => {
	// Check if Stripe is connected
	if (isStripeConnected({ org, env })) {
		return ProcessorType.Stripe;
	}

	// Default to Stripe for now (backward compatibility)
	// In the future, this could check org.config.payment_provider
	return ProcessorType.Stripe;
};

/**
 * Checks if a payment provider is available for an organization
 */
export const isPaymentProviderAvailable = ({
	org,
	env,
	providerType,
}: {
	org: Organization;
	env: AppEnv;
	providerType: ProcessorType;
}): boolean => {
	switch (providerType) {
		case ProcessorType.Stripe:
			return isStripeConnected({ org, env });

		default:
			return false;
	}
};

