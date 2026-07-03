import { type RouteScopeRequirement, Scopes } from "@autumn/shared";

/** Per-user Slack approval scopes; tests enforce coverage for gated MCP tools. */
export const approvalScopeRequirements: Record<string, RouteScopeRequirement> =
	{
		attach: [Scopes.Billing.Write],
		createBalance: [Scopes.Balances.Write],
		createPlan: [Scopes.Plans.Write],
		createSchedule: [Scopes.Billing.Write],
		updateCatalog: { ALL: [Scopes.Plans.Write, Scopes.Features.Write] },
		updatePlan: [Scopes.Plans.Write],
		updateSubscription: [Scopes.Billing.Write],
	};
