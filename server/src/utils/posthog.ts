import { PostHog } from "posthog-node";

export const posthogClient = process.env.POSTHOG_API_KEY
	? new PostHog(process.env.POSTHOG_API_KEY, {
			host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
		})
	: null;

// Helper for capturing events with org group
export const captureOrgEvent = async ({
	userId,
	orgId,
	event,
	properties = {},
}: {
	userId?: string;
	orgId: string;
	event: string;
	properties?: Record<string, unknown>;
}) => {
	if (!posthogClient) return;

	try {
		await posthogClient.capture({
			distinctId: userId || orgId,
			event,
			groups: { company: orgId },
			properties: {
				org_id: orgId,
				...properties,
			},
		});
	} catch (_error) {
		// Don't let PostHog errors affect the caller
	}
};
