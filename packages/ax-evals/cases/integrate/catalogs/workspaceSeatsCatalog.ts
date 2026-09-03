/**
 * Workspace-seats archetype catalog (license flows): Team $600/mo comes with
 * 10 workspaces; each workspace is a $10/mo license plan granting 1,000
 * credits. Trimmed to what license integration cases need — no starter or
 * annual twins.
 */
export const workspaceSeatsCatalog = `import { feature, plan, item } from "atmn";

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

// Non-consumable: counts what exists (seats in use), not events.
export const workspaces = feature({
	id: "workspaces",
	name: "Workspaces",
	type: "metered",
	consumable: false,
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
	licenses: [{ licensePlanId: "workspace", included: 10 }],
});
`;
