/** Which Autumn MCP tools each agent may discover. The split is the point of
 * the subagent architecture: a small surface per specialist. */

const ORG_CONTEXT_READS = [
	"getAgentRules",
	"listFeatures",
	"listPlans",
] as const;

const DATE_UTILS = [
	"dateToEpochMilliseconds",
	"epochMillisecondsToDate",
] as const;

const CUSTOMER_READS = [
	"getCustomer",
	"getEntity",
	"listCustomers",
	"listEntities",
] as const;

export const toolAllowlists = {
	billing: [
		...ORG_CONTEXT_READS,
		...DATE_UTILS,
		...CUSTOMER_READS,
		"attach",
		"createBalance",
		"createEntity",
		"createReward",
		"createSchedule",
		"getOrCreateCustomer",
		"getPlan",
		"listRewards",
		"previewAttach",
		"previewCreateBalance",
		"previewCreateSchedule",
		"previewUpdateSubscription",
		"updateCustomer",
		"updateSubscription",
	],
	catalog: [
		...ORG_CONTEXT_READS,
		...DATE_UTILS,
		"createPlan",
		"createReward",
		"getPlan",
		"listRewards",
		"previewUpdateCatalog",
		"updateCatalog",
		"updatePlan",
	],
	investigator: [
		...ORG_CONTEXT_READS,
		...DATE_UTILS,
		...CUSTOMER_READS,
		"getCurrentOrganization",
		"getPlan",
		"listRewards",
		"queryRequestLogs",
		"searchRequestLogs",
	],
	/** Routing plus org context and catalog reads; catalog writes live only in
	 * the (unwired) catalog specialist (see agent/subagents/README.md). */
	// A pure router: delegation plus the one gated admin write. Org context is
	// preloaded server-side; every other read lives on a specialist.
	orchestrator: ["updateAgentRules"],
} as const satisfies Record<string, readonly string[] | undefined>;

export type LeafAgentConnection = keyof typeof toolAllowlists;
