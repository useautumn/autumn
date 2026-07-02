import { type RouteScopeRequirement, Scopes } from "@autumn/shared";

/**
 * Autumn scopes a per-user Slack clicker must hold to approve each
 * approval-gated tool. The canonical tool list is derived from the MCP tool
 * definitions (`@autumn/mcp/approval-gated`); the coverage test in
 * approvalScopeRequirements.test.ts fails when a destructive tool ships without
 * an entry here, and per-user approvals fail closed at click time for anything
 * unlisted.
 */
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
