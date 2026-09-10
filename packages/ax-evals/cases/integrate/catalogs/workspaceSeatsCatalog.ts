/**
 * Workspace-seats archetype catalog (license flows): Team $600/mo comes with
 * 10 workspaces; each workspace is a $10/mo license plan granting 1,000
 * credits. Trimmed to what license integration cases need — no starter or
 * annual twins.
 */
export const workspaceSeatsCatalog = `import { atmn, feature, plan } from "atmn";

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
		feature({
			featureId: "workspaces",
			name: "Workspaces",
			type: "metered",
			consumable: false,
		}),
	],
	plans: [
		plan({
			planId: "workspace",
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
			name: "Team",
			price: { amount: 600, interval: "month" },
			licenses: [{ licensePlanId: "workspace", included: 10 }],
		}),
	],
});
`;
