/**
 * Scraping-API archetype catalog (FireCrawl-like enterprise credits): one
 * metered consumable credit feature on a paid plan whose item is a PURE
 * GRANT — no usage-based price, so zero balance is a hard stop by default.
 * Overage capability for chosen customers must come from the
 * overage_allowed billing control, not the catalog.
 */
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
