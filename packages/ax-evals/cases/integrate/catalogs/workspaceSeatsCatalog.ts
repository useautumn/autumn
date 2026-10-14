export const workspaceSeatsCatalog = `import { atmn, feature, license, plan } from "atmn";

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
			licenses: [
				license({ licensePlanId: "workspace", versionSlug: "v1", included: 10 }),
			],
		}),
	],
});
`;
