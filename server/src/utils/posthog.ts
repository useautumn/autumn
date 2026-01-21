import { PostHog } from "posthog-node";

export const posthogClient = new PostHog(process.env.POSTHOG_API_KEY!, {
	host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
});

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
	await posthogClient.capture({
		distinctId: userId || orgId,
		event,
		groups: { company: orgId },
		properties: {
			org_id: orgId,
			...properties,
		},
	});
};
