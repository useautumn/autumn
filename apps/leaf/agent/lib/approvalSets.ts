import type { LeafAgentConnection } from "./toolAllowlists.js";

/** Every gated write, exactly as the pre-split connection guarded them. */
const ALL_APPROVAL_TOOL_NAMES = [
	"attach",
	"confirmBillingAction",
	"createBalance",
	"createEntity",
	"createPlan",
	"createReward",
	"createSchedule",
	"updateAgentRules",
	"updateCatalog",
	"updateCustomer",
	"updatePlan",
	"updateSubscription",
] as const;

export const approvalSets: Record<LeafAgentConnection, ReadonlySet<string>> = {
	billing: new Set([
		"attach",
		"createBalance",
		"createEntity",
		"createSchedule",
		"updateCustomer",
		"updateSubscription",
	]),
	catalog: new Set([
		"createPlan",
		"createReward",
		"updateCatalog",
		"updatePlan",
	]),
	investigator: new Set(),
	orchestrator: new Set(["confirmBillingAction", "updateAgentRules"]),
	root: new Set(ALL_APPROVAL_TOOL_NAMES),
};

const splitUnion = new Set([
	...approvalSets.billing,
	...approvalSets.catalog,
	...approvalSets.investigator,
	...approvalSets.orchestrator,
]);
for (const name of ALL_APPROVAL_TOOL_NAMES) {
	// The split must never quietly drop a gate the monolith enforced.
	if (!splitUnion.has(name)) {
		throw new Error(`Approval gate lost in the agent split: ${name}`);
	}
}
