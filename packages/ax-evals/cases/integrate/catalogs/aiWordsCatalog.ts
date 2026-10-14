export const aiWordsCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "words",
			name: "Words",
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
					featureId: "words",
					included: 1000,
					reset: { interval: "month" },
				},
			],
		}),
	],
});
`;
