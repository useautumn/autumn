export const booleanGateCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "custom_branding",
			name: "Custom Branding",
			type: "boolean",
		}),
	],
	plans: [
		plan({
			planId: "free",
			versionSlug: "v1",
			active: true,
			name: "Free",
			autoEnable: true,
			items: [],
		}),
		plan({
			planId: "pro",
			versionSlug: "v1",
			active: true,
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "custom_branding" }],
		}),
	],
});
`;
