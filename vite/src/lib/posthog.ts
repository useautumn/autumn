import type { PostHog } from "posthog-js";

let posthogPromise: Promise<PostHog> | null = null;

/** posthog-js is ~270KB, so it loads after first paint instead of in the entry chunk. */
export const getPostHog = () => {
	posthogPromise ??= import("posthog-js").then(({ default: posthog }) => {
		const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
		if (process.env.NODE_ENV === "production" && apiKey) {
			posthog.init(apiKey, {
				api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
				autocapture: false,
				capture_pageview: false,
				capture_pageleave: false,
			});
		}
		return posthog;
	});
	return posthogPromise;
};
