/**
 * Boolean-gate catalog: a paid-only on/off feature. The auto-enable free
 * plan carries nothing; Pro carries the boolean custom_branding item.
 */
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
			name: "Free",
			autoEnable: true,
			items: [],
		}),
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "custom_branding" }],
		}),
	],
});
`;
