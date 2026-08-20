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
		"createSchedule",
		"getOrCreateCustomer",
		"getPlan",
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
	orchestrator: [
		...ORG_CONTEXT_READS,
		"getCurrentOrganization",
		"updateAgentRules",
	],
	/** The pre-split surface: everything. Kept while the root still does all
	 * domain work itself; deleted once every specialist is live. */
	root: undefined,
} as const satisfies Record<string, readonly string[] | undefined>;

export type LeafAgentConnection = keyof typeof toolAllowlists;
