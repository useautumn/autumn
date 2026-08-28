/** Reusable golden-config builder: a Pro plan with monthly AI credits.
 * Defaults match the vague/clear credits pair; conduct cases seed it as the
 * pre-existing config. */
export const creditsGoldenConfig = ({
	price = 20,
	included = 10,
}: {
	price?: number;
	included?: number;
} = {}): string => `import { feature, plan, item } from "atmn";

export const aiCredits = feature({
	id: "ai_credits",
	name: "AI Credits",
	type: "metered",
	consumable: true,
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: ${price}, interval: "month" },
	items: [
		item({
			featureId: aiCredits.id,
			included: ${included},
			reset: { interval: "month" },
		}),
	],
});
`;
