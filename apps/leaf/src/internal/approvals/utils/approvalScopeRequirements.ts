import {
	type RouteScopeRequirement,
	type ScopeString,
	Scopes,
} from "@autumn/shared";
import { withheldWritesFromToolArgs } from "../../agentRuntime/eve/parkedInput.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";

/** Per-user Slack approval scopes; tests enforce coverage for gated MCP tools. */
export const approvalScopeRequirements: Record<string, RouteScopeRequirement> =
	{
		attach: [Scopes.Billing.Write],
		createBalance: [Scopes.Balances.Write],
		createPlan: [Scopes.Plans.Write],
		createReward: [Scopes.Rewards.Write],
		createSchedule: [Scopes.Billing.Write],
		updateCatalog: { ALL: [Scopes.Plans.Write, Scopes.Features.Write] },
		updateCustomer: [Scopes.Customers.Write],
		updatePlan: [Scopes.Plans.Write],
		updateSubscription: [Scopes.Billing.Write],
	};

/** Only plain and ALL requirements can be unioned; an ANY requirement has no
 * sound merge, so a group containing one fails closed. */
const allScopesIn = (
	requirement: RouteScopeRequirement,
): readonly ScopeString[] | undefined => {
	if (!("ALL" in requirement || "ANY" in requirement)) return requirement;
	if ("ANY" in requirement) return undefined;
	return requirement.ALL;
};

/** Approving a grouped card applies every step, so it requires every step's
 * scopes. An unrecognised step fails closed. */
export const requiredScopesForApproval = ({
	toolArgs,
	toolName,
}: {
	toolArgs?: Record<string, unknown>;
	toolName: string;
}): RouteScopeRequirement | undefined => {
	const primary = approvalScopeRequirements[normalizeToolName(toolName)];
	if (!primary) return undefined;

	const grouped = withheldWritesFromToolArgs(toolArgs);
	if (!grouped.length) return primary;

	const primaryScopes = allScopesIn(primary);
	if (!primaryScopes) return undefined;

	const scopes = new Set<ScopeString>(primaryScopes);
	for (const step of grouped) {
		const stepRequirement =
			approvalScopeRequirements[normalizeToolName(step.toolName)];
		if (!stepRequirement) return undefined;
		const stepScopes = allScopesIn(stepRequirement);
		if (!stepScopes) return undefined;
		for (const scope of stepScopes) scopes.add(scope);
	}
	return { ALL: [...scopes] };
};
