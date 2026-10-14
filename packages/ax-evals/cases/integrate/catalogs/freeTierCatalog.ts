export const freeTierCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "summaries",
			name: "Summaries",
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
					featureId: "summaries",
					included: 3,
					reset: { interval: "month" },
				},
			],
		}),
	],
});
`;
