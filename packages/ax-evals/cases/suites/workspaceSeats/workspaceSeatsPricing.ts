import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

/**
 * Anonymized real-customer archetype: an integration platform whose billable
 * unit is a WORKSPACE — never called a "seat" in the brief. Its signature
 * decisions — what this suite exists to test:
 *   ① a unit that both costs money AND grants credits → a license plan,
 *     recognized from allusive phrasing ("each workspace is $10 and comes
 *     with its own credits"), not from the words "seat-based"
 *   ② two credit inflows into one balance: the per-workspace grant lives on
 *     the workspace plan; the shared prepaid purchase lives on the base plans
 *   ③ ONE workspace plan reused by every tier via `licenses` with per-plan
 *     included counts (starter 1, team 10)
 *   ④ per-link customization: starter's workspaces grant only 500 credits —
 *     a `customize` diff on starter's license link, NOT a second plan
 * Annual variant and enterprise ride along as anchors, not cases.
 */

export const workspaceSeatsGoal =
	"Get your integration platform's workspace-based pricing set up in Autumn without touching a dashboard.";

/** The full brief the simulated user answers from. Deliberately allusive:
 * the billable unit is "a workspace", never "a seat" or "per user". */
export const workspaceSeatsFacts = [
	"- Two main plans: Starter (no base fee) and Team at $600 a month. Team also has an annual option at $6,000 a year.",
	"- Everything runs on credits: 1 action call costs 1 credit.",
	"- Customers connect workspaces. Each workspace they add runs $10 a month on Team — on Starter it's $15. Starter comes with 1 workspace, Team comes with 10 — they can always add more.",
	"- Each workspace gets its own 1,000 credits a month to use — except on Starter, where a workspace only gets 500.",
	"- Teams can also buy shared credit packs the whole account draws from: on Team it's $20 per 20,000 credits a month; on Starter it's $60 per 20,000.",
	"- On the annual plan, credits still reset monthly.",
	"- There's also an Enterprise plan — custom annual pricing (about $25k/year), sales-led.",
	"- Nobody starts on a plan automatically — customers subscribe to Starter or Team themselves. Starter isn't a free tier; it just has no base fee.",
	"- No trials.",
].join("\n");

/** ① the workspace is its own plan: $10/mo base, grants 1,000 credits/mo. */
export const workspacePlanSpec: PlanSpec = {
	price: { amount: 10, interval: "month" },
	items: [{ included: 1000, reset: { interval: "month" } }],
};

/** ②③ team: $600 base, 10 workspaces included, shared prepaid at the good
 * rate. */
export const teamSpec: PlanSpec = {
	price: { amount: 600, interval: "month" },
	licenses: [{ included: 10 }],
	items: [
		{
			price: {
				amount: 20,
				billing_units: 20000,
				billing_method: "prepaid",
			},
		},
	],
};

/** ②③④ starter: free base, 1 workspace included, worse prepaid rate, and
 * the license link customized BOTH ways — $15 workspaces, 500 credits. */
export const starterSpec: PlanSpec = {
	freePlan: true,
	licenses: [
		{
			included: 1,
			customize: {
				price: { amount: 15, interval: "month" },
				add_items: [{ included: 500 }],
			},
		},
	],
	items: [
		{
			price: {
				amount: 60,
				billing_units: 20000,
				billing_method: "prepaid",
			},
		},
	],
};

export const teamAnnualSpec: PlanSpec = {
	price: { amount: 6000, interval: "year" },
	licenses: [{ included: 10 }],
};

/** Known-correct config. withStarter=false leaves starter out — the seed
 * workspace for seedStarterReuse. */
export const workspaceSeatsConfig = ({
	withStarter = true,
}: {
	withStarter?: boolean;
} = {}): string => `import { feature, plan, item } from "atmn";

export const actionCalls = feature({
	id: "action_calls",
	name: "Action Calls",
	type: "metered",
	consumable: true,
});

export const credits = feature({
	id: "credits",
	name: "Credits",
	type: "credit_system",
	creditSchema: [{ meteredFeatureId: "action_calls", creditCost: 1 }],
});

export const workspace = plan({
	id: "workspace",
	name: "Workspace",
	price: { amount: 10, interval: "month" },
	items: [
		item({
			featureId: credits.id,
			included: 1000,
			reset: { interval: "month" },
		}),
	],
});

export const team = plan({
	id: "team",
	name: "Team",
	price: { amount: 600, interval: "month" },
	items: [
		item({
			featureId: credits.id,
			included: 0,
			price: {
				amount: 20,
				billingUnits: 20000,
				billingMethod: "prepaid",
				interval: "month",
			},
		}),
	],
	licenses: [{ licensePlanId: "workspace", included: 10 }],
});

export const teamAnnual = team.variant({
	id: "team_annual",
	name: "Team (Annual)",
	customize: {
		price: { amount: 6000, interval: "year" },
	},
});

export const enterprise = plan({
	id: "enterprise",
	name: "Enterprise",
	price: { amount: 25000, interval: "year" },
	licenses: [{ licensePlanId: "workspace", included: 0 }],
	items: [],
});
${
	withStarter
		? `
export const starter = plan({
	id: "starter",
	name: "Starter",
	items: [
		item({
			featureId: credits.id,
			included: 0,
			price: {
				amount: 60,
				billingUnits: 20000,
				billingMethod: "prepaid",
				interval: "month",
			},
		}),
	],
	licenses: [
		{
			licensePlanId: "workspace",
			included: 1,
			customize: {
				price: { amount: 15, interval: "month" },
				addItems: [
					item({
						featureId: credits.id,
						included: 500,
						reset: { interval: "month" },
					}),
				],
				removeItems: [{ featureId: credits.id }],
			},
		},
	],
});
`
		: ""
}`;
