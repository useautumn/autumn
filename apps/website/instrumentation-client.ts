import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Shares the dashboard's project key so the .useautumn.com cookie carries a
// visitor's first referrer and UTM tags onto the person who later signs up.
if (POSTHOG_KEY) {
	posthog.init(POSTHOG_KEY, {
		api_host: "https://us.i.posthog.com",
		defaults: "2025-11-30",
		cross_subdomain_cookie: true,
	});
}
