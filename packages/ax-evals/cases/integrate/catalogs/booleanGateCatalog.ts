/**
 * Boolean-gate catalog: a paid-only on/off feature. The auto-enable free
 * plan carries nothing; Pro carries the boolean custom_branding item.
 */
export const booleanGateCatalog = `import { feature, plan, item } from "atmn";

export const customBranding = feature({
	id: "custom_branding",
	name: "Custom Branding",
	type: "boolean",
});

export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [item({ featureId: customBranding.id })],
});
`;
