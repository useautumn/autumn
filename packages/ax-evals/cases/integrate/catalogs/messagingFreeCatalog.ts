/**
 * Messaging-API archetype catalog (Resend-like free tier): one metered
 * consumable feature with a generous monthly grant on a free auto-enable
 * plan and NO overage price — the shape where a daily usage_limits cap on
 * top of the monthly allowance is the right throttle.
 */
export const messagingFreeCatalog = `import { feature, plan, item } from "atmn";

export const emails = feature({
	id: "emails",
	name: "Emails",
	type: "metered",
	consumable: true,
});

export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [
		item({
			featureId: emails.id,
			included: 3000,
			reset: { interval: "month" },
		}),
	],
});
`;
