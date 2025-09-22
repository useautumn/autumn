import { EventMessage, PostHog } from "posthog-node";

export const posthogCapture = ({
	posthog,
	params,
}: {
	posthog?: PostHog;
	params: EventMessage;
}) => {
	try {
		if (process.env.NODE_ENV === "development" || !posthog) {
			return;
		}

		posthog.capture(params);
	} catch (error) {
		console.error("Failed to capture posthog event", params);
		console.error(error);
	}
};
