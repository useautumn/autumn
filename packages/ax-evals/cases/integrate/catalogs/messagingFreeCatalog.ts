/**
 * Messaging-API archetype catalog (Resend-like free tier): one metered
 * consumable feature with a generous monthly grant on a free auto-enable
 * plan and NO overage price — the shape where a daily usage_limits cap on
 * top of the monthly allowance is the right throttle.
 */
export const messagingFreeCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "emails",
			name: "Emails",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [
		plan({
			planId: "free",
			name: "Free",
			autoEnable: true,
			items: [
				{
					featureId: "emails",
					included: 3000,
					reset: { interval: "month" },
				},
			],
		}),
	],
});
`;
