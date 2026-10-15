import posthog from "posthog-js";

// Public project key, shared with the dashboard so the .useautumn.com cookie
// carries a visitor's first referrer and UTM tags onto the person who signs up.
const POSTHOG_KEY = "phc_L763VL2WY6TExI5xG5xWOua6E5LYkZN496hBeSpEdAn";
const PRODUCTION_HOST = /(^|\.)useautumn\.com$/;

if (PRODUCTION_HOST.test(window.location.hostname)) {
	posthog.init(POSTHOG_KEY, {
		api_host: "https://us.i.posthog.com",
		defaults: "2025-11-30",
		cross_subdomain_cookie: true,
	});
}
