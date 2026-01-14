import posthog from "posthog-js";

// Toggle this to enable/disable tracking in development
export const TRACK_IN_DEVELOPMENT = false;

/**
 * Wrapper function to conditionally track events based on environment
 */
function trackEvent(eventName: string, properties?: Record<string, unknown>) {
	try {
		// Skip tracking in development unless explicitly enabled
		if (process.env.NODE_ENV === "development" && !TRACK_IN_DEVELOPMENT) {
			console.log(`[DEV] Would track event: ${eventName}`, properties);
			return;
		}

		posthog.capture(eventName, properties);
	} catch (error) {
		console.error(`Error tracking event: ${eventName}`, error);
	}
}

/**
 * Wrapper function to conditionally identify users based on environment
 */
function identifyUserInPostHog(
	distinctId: string,
	properties?: Record<string, unknown>,
) {
	// Skip tracking in development unless explicitly enabled
	if (process.env.NODE_ENV === "development" && !TRACK_IN_DEVELOPMENT) {
		// console.log(`[DEV] Would identify user: ${distinctId}`, properties);
		return;
	}

	posthog.identify(distinctId, properties);
}

/**
 * Identify user in PostHog (call when user data is available)
 */
export function identifyUser({
	email,
	name,
}: {
	email: string;
	name?: string;
}) {
	identifyUserInPostHog(email, {
		email,
		...(name && { name }),
	});
}

/**
 * Track user sign-up
 */
export function trackSignUp() {
	trackEvent("user_signed_up");
}

/**
 * Track onboarding product creation
 */
export function trackOnboardingProductCreation({
	productType,
}: {
	productType: "free" | "paid";
}) {
	trackEvent("onboarding_product_created", {
		product_type: productType,
	});
}

/**
 * Track onboarding feature creation
 */
export function trackOnboardingFeatureCreation({
	featureType,
}: {
	featureType: string;
}) {
	trackEvent("onboarding_feature_created", {
		feature_type: featureType,
	});
}

/**
 * Track onboarding feature configuration
 */
export function trackOnboardingFeatureConfigured() {
	trackEvent("onboarding_feature_configured");
}

/**
 * Track onboarding playground completion
 */
export function trackOnboardingPlaygroundCompleted() {
	trackEvent("onboarding_playground_completed");
}

/**
 * Track onboarding integration completion
 */
export function trackOnboardingIntegrationCompleted() {
	trackEvent("onboarding_integration_completed");
}
