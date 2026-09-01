/** Which Autumn MCP tools each agent may discover. */

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
	leaf: [
		...ORG_CONTEXT_READS,
		...DATE_UTILS,
		...CUSTOMER_READS,
		"attach",
		"createBalance",
		"createEntity",
		"createReward",
		"createSchedule",
		"getCurrentOrganization",
		"getOrCreateCustomer",
		"getPlan",
		"listRewards",
		"previewAttach",
		"previewCreateBalance",
		"previewCreateSchedule",
		"previewUpdateSubscription",
		"queryRequestLogs",
		"searchRequestLogs",
		"updateAgentRules",
		"updateCustomer",
		"updateSubscription",
	],
} as const satisfies Record<string, readonly string[] | undefined>;

export type LeafAgentConnection = keyof typeof toolAllowlists;
