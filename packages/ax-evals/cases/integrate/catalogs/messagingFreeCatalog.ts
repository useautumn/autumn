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
			versionSlug: "v1",
			active: true,
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
