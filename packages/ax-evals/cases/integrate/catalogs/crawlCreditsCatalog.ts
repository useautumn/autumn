export const crawlCreditsCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "credits",
			name: "Crawl Credits",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [
		plan({
			planId: "scale",
			versionSlug: "v1",
			active: true,
			name: "Scale",
			price: { amount: 500, interval: "month" },
			items: [
				{
					featureId: "credits",
					included: 100000,
					reset: { interval: "month" },
				},
			],
		}),
	],
});
`;
