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
		"issueCreditNote",
		"listRewards",
		"previewUpdateCatalog",
		"updateCatalog",
		"updatePlan",
	],
	leaf: [
		...ORG_CONTEXT_READS,
		...DATE_UTILS,
		...CUSTOMER_READS,
		"aggregateEvents",
		"attach",
		"createBalance",
		"createEntity",
		"createInvoice",
		"createReward",
		"finalizeInvoice",
		"getCurrentOrganization",
		"getInvoice",
		"getOrCreateCustomer",
		"getPlan",
		"listInvoiceTemplates",
		"listInvoices",
		"listRewards",
		"payInvoice",
		"previewAttach",
		"previewCreateBalance",
		"previewCreateInvoice",
		"previewIssueCreditNote",
		"previewReissueInvoice",
		"previewSetPlans",
		"previewUpdateSubscription",
		"queryRequestLogs",
		"reissueInvoice",
		"searchRequestLogs",
		"searchStripeEndpoints",
		"setPlans",
		"stripeRead",
		"updateAgentRules",
		"updateCustomer",
		"updateSubscription",
		"voidInvoice",
	],
} as const satisfies Record<string, readonly string[] | undefined>;

export type LeafAgentConnection = keyof typeof toolAllowlists;
