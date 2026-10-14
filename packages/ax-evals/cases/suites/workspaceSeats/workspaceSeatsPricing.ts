import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

export const workspaceSeatsGoal =
	"Get your integration platform's workspace-based pricing set up in Autumn without touching a dashboard.";

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

export const workspacePlanSpec: PlanSpec = {
	price: { amount: 10, interval: "month" },
	items: [{ included: 1000, reset: { interval: "month" } }],
};

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

export const workspaceSeatsConfig = ({
	withStarter = true,
}: {
	withStarter?: boolean;
} = {}): string => `import { atmn, feature, license, plan, variant } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "action_calls",
			name: "Action Calls",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "credits",
			name: "Credits",
			type: "credit_system",
			creditSchema: [{ meteredFeatureId: "action_calls", creditCost: 1 }],
		}),
	],
	plans: [
		plan({
			planId: "workspace",
			versionSlug: "v1",
			active: true,
			name: "Workspace",
			price: { amount: 10, interval: "month" },
			items: [
				{
					featureId: "credits",
					included: 1000,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "team",
			versionSlug: "v1",
			active: true,
			name: "Team",
			price: { amount: 600, interval: "month" },
			items: [
				{
					featureId: "credits",
					included: 0,
					price: {
						amount: 20,
						billingUnits: 20000,
						billingMethod: "prepaid",
						interval: "month",
					},
				},
			],
			licenses: [
				license({ licensePlanId: "workspace", versionSlug: "v1", included: 10 }),
			],
			variants: [
				variant({
					variantPlanId: "team_annual",
					versionSlug: "v1",
					name: "Team (Annual)",
					customize: {
						price: { amount: 6000, interval: "year" },
					},
				}),
			],
		}),
		plan({
			planId: "enterprise",
			versionSlug: "v1",
			active: true,
			name: "Enterprise",
			price: { amount: 25000, interval: "year" },
			licenses: [
				license({ licensePlanId: "workspace", versionSlug: "v1", included: 0 }),
			],
			items: [],
		}),
${
	withStarter
		? `		plan({
			planId: "starter",
			versionSlug: "v1",
			active: true,
			name: "Starter",
			items: [
				{
					featureId: "credits",
					included: 0,
					price: {
						amount: 60,
						billingUnits: 20000,
						billingMethod: "prepaid",
						interval: "month",
					},
				},
			],
			licenses: [
				license({
					licensePlanId: "workspace",
					versionSlug: "v1",
					included: 1,
					customize: {
						price: { amount: 15, interval: "month" },
						addItems: [
							{
								featureId: "credits",
								included: 500,
								reset: { interval: "month" },
							},
						],
						removeItems: [{ featureId: "credits" }],
					},
				}),
			],
		}),
`
		: ""
}	],
});
`;
