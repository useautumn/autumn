/**
 * Reusable config SOURCE for atmn tests. Everything here is text the CLI
 * executes, so a test reads like the config it is about. Compose with
 * `configBody` and hand the result to `initAtmnScenario({ config })`.
 */

/** Every feature type: two metered (one non-consumable), a credit system over
 * them, an AI credit system, and two booleans. */
export const everyFeatureType = `
		feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false, display: { singular: "seat", plural: "seats" } }),
		feature({ featureId: "messages", name: "Messages", type: "metered", consumable: true }),
		feature({ featureId: "api_calls", name: "API Calls", type: "metered", consumable: true }),
		feature({
			featureId: "credits",
			name: "Credits",
			type: "credit_system",
			consumable: true,
			creditSchema: [
				{ meteredFeatureId: "messages", creditCost: 1 },
				{ meteredFeatureId: "api_calls", creditCost: 2 },
			],
		}),
		feature({
			featureId: "ai_credits",
			name: "AI Credits",
			type: "ai_credit_system",
			consumable: true,
			creditSchema: [],
			modelMarkups: {
				"openai/gpt-4o": { markup: 25 },
				"anthropic/claude-sonnet-4": { inputCost: 3, outputCost: 15 },
			},
			defaultMarkup: 20,
			providerMarkups: { openai: { markup: 10 }, anthropic: { markup: 15 } },
		}),
		feature({ featureId: "sso", name: "SSO", type: "boolean" }),
		feature({ featureId: "audit_log", name: "Audit Log", type: "boolean" }),`;

export const freePlan = `
		plan({
			planId: "free",
			name: "Free",
			items: [
				{ featureId: "messages", included: 100, reset: { interval: "month" } },
				{ featureId: "seats", included: 1 },
			],
		}),`;

/** A paid monthly plan; pass item source lines to shape it. */
export const paidMonthly = ({
	planId = "pro",
	amount = 49,
	items = "",
	extra = "",
}: {
	planId?: string;
	amount?: number;
	items?: string;
	extra?: string;
} = {}): string => `
		plan({
			planId: "${planId}",
			name: "${planId[0].toUpperCase()}${planId.slice(1)}",
			price: { amount: ${amount}, interval: "month" },
			items: [${items}
			],${extra}
		}),`;

/** The complicated pro: trial, prepaid seats with proration, graduated overage,
 * an unlimited item, a boolean, spend limit and usage alert. Version via `versionSlug`. */
export const versionedPro = ({
	versionSlug = "v1",
	amount = 49,
	extraItems = "",
}: {
	versionSlug?: string;
	amount?: number;
	extraItems?: string;
} = {}): string => `
		plan({
			planId: "pro",
			versionSlug: "${versionSlug}",
			name: "Pro",
			description: "For growing teams.",
			group: "core",
			price: { amount: ${amount}, interval: "month" },
			freeTrial: { durationLength: 14, durationType: "day", cardRequired: true, onEnd: "bill" },
			items: [
				{ featureId: "messages", unlimited: true },
				{
					featureId: "seats",
					included: 5,
					price: { billingMethod: "prepaid", interval: "month", amount: 10, billingUnits: 1, maxPurchase: 50 },
					proration: { onIncrease: "prorate_immediately", onDecrease: "prorate" },
				},
				{
					featureId: "api_calls",
					included: 10000,
					reset: { interval: "month" },
					price: {
						billingMethod: "usage_based",
						interval: "month",
						billingUnits: 1000,
						tierBehavior: "graduated",
						tiers: [
							{ to: 50000, amount: 0.01 },
							{ to: 200000, amount: 0.008 },
							{ to: "inf", amount: 0.005 },
						],
					},
				},
				{ featureId: "sso" },${extraItems}
			],
			billingControls: {
				spendLimits: [{ featureId: "api_calls", enabled: true, limitType: "absolute", overageLimit: 500 }],
				usageAlerts: [{ featureId: "api_calls", enabled: true, threshold: 80, thresholdType: "usage_percentage", name: "80% of overage cap" }],
			},
		}),`;

/** A seat license plan and an enterprise plan that licenses it. */
export const seatPlan = `
		plan({
			planId: "seat",
			name: "Seat",
			price: { amount: 15, interval: "month" },
			items: [{ featureId: "seats", included: 1 }],
		}),`;
export const enterpriseWithSeats = ({
	included = 25,
}: {
	included?: number;
} = {}): string => `
		plan({
			planId: "enterprise",
			name: "Enterprise",
			price: { amount: 999, interval: "month" },
			items: [{ featureId: "sso" }, { featureId: "audit_log" }],
			licenses: [{ licensePlanId: "seat", included: ${included} }],
		}),`;

/** The `atmn({...})` body from collection sources. Omit a key to leave that
 * collection alone on the server; pass "" to state it empty. */
export const configBody = ({
	features,
	plans,
	planVersions,
}: {
	features?: string;
	plans?: string;
	planVersions?: string;
}): string => {
	const lines: string[] = [];
	if (features !== undefined) lines.push(`\tfeatures: [${features}\n\t],`);
	if (plans !== undefined) lines.push(`\tplans: [${plans}\n\t],`);
	if (planVersions !== undefined)
		lines.push(`\tplanVersions: [${planVersions}\n\t],`);
	return `{\n${lines.join("\n")}\n}`;
};
