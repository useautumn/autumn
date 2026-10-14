import posthog from "posthog-js";

const TRACK_IN_DEVELOPMENT = false;

function trackEvent(eventName: string, properties?: Record<string, unknown>) {
	try {
		if (process.env.NODE_ENV === "development" && !TRACK_IN_DEVELOPMENT) {
			console.log(`[DEV] Would track event: ${eventName}`, properties);
			return;
		}

		posthog.capture(eventName, properties);
	} catch (error) {
		console.error(`Error tracking event: ${eventName}`, error);
	}
}

function identifyUserInPostHog(
	distinctId: string,
	properties?: Record<string, unknown>,
) {
	if (process.env.NODE_ENV === "development" && !TRACK_IN_DEVELOPMENT) {
		return;
	}

	posthog.identify(distinctId, properties);
}

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

function trackSignUp() {
	trackEvent("user_signed_up");
}

function trackOnboardingProductCreation({
	productType,
}: {
	productType: "free" | "paid";
}) {
	trackEvent("onboarding_product_created", {
		product_type: productType,
	});
}

function trackOnboardingFeatureCreation({
	featureType,
}: {
	featureType: string;
}) {
	trackEvent("onboarding_feature_created", {
		feature_type: featureType,
	});
}

function trackOnboardingFeatureConfigured() {
	trackEvent("onboarding_feature_configured");
}

function trackOnboardingPlaygroundCompleted() {
	trackEvent("onboarding_playground_completed");
}

function trackOnboardingIntegrationCompleted() {
	trackEvent("onboarding_integration_completed");
}
