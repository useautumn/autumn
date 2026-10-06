import type { RouteScopeRequirement } from "@autumn/shared";
import type { LeafAgentConnection } from "./toolAllowlists.js";

type GatedWrite = {
	agents: readonly LeafAgentConnection[];
	previewTool?: string;
	/** The preview tool takes the write's own request body, so the write is
	 * only accepted with a request the agent previewed verbatim this session —
	 * the card, the walkthrough and the executed write then all describe one
	 * request. Catalog previews reshape the request and cannot be compared. */
	previewedRequestRequired?: true;
	scopes?: RouteScopeRequirement;
	toolName: string;
};

/** The authoritative gated-write table: approval sets, scope requirements
 * (absent = fails closed), and write→preview mapping all derive from here. */
export const GATED_WRITES: readonly GatedWrite[] = [
	{
		agents: ["leaf"],
		previewTool: "previewAttach",
		scopes: ["billing:write"],
		previewedRequestRequired: true,
		toolName: "attach",
	},
	{
		agents: ["leaf"],
		previewTool: "previewCreateBalance",
		scopes: ["balances:write"],
		previewedRequestRequired: true,
		toolName: "createBalance",
	},
	{
		agents: ["leaf"],
		toolName: "createEntity",
	},
	{
		agents: ["leaf"],
		previewTool: "previewCreateInvoice",
		scopes: ["billing:write"],
		previewedRequestRequired: true,
		toolName: "createInvoice",
	},
	{
		agents: ["catalog"],
		previewTool: "previewUpdateCatalog",
		scopes: ["plans:write"],
		toolName: "createPlan",
	},
	{
		agents: ["catalog", "leaf"],
		scopes: ["rewards:write"],
		toolName: "createReward",
	},
	// Leaf schedules with setPlans now; createSchedule stays gated for the MCP
	// tool it still exposes and for approvals parked before the switch.
	{
		agents: ["leaf"],
		previewTool: "previewCreateSchedule",
		scopes: ["billing:write"],
		previewedRequestRequired: true,
		toolName: "createSchedule",
	},
	{
		agents: ["leaf"],
		previewTool: "getInvoice",
		scopes: ["billing:write"],
		toolName: "finalizeInvoice",
	},
	{
		agents: ["leaf"],
		previewTool: "getInvoice",
		scopes: ["billing:write"],
		toolName: "payInvoice",
	},
	{
		agents: ["leaf"],
		previewTool: "previewIssueCreditNote",
		scopes: ["billing:write"],
		previewedRequestRequired: true,
		toolName: "issueCreditNote",
	},
	{
		agents: ["leaf"],
		previewTool: "previewReissueInvoice",
		scopes: ["billing:write"],
		previewedRequestRequired: true,
		toolName: "reissueInvoice",
	},
	{
		agents: ["leaf"],
		previewTool: "previewSetPlans",
		scopes: ["billing:write"],
		previewedRequestRequired: true,
		toolName: "setPlans",
	},
	{
		agents: ["leaf"],
		toolName: "updateAgentRules",
	},
	{
		agents: ["catalog"],
		previewTool: "previewUpdateCatalog",
		scopes: { ALL: ["plans:write", "features:write"] },
		toolName: "updateCatalog",
	},
	{
		agents: ["leaf"],
		scopes: ["customers:write"],
		toolName: "updateCustomer",
	},
	{
		agents: ["catalog"],
		previewTool: "previewUpdateCatalog",
		scopes: ["plans:write"],
		toolName: "updatePlan",
	},
	{
		agents: ["leaf"],
		previewTool: "previewUpdateSubscription",
		scopes: ["billing:write"],
		previewedRequestRequired: true,
		toolName: "updateSubscription",
	},
	{
		agents: ["leaf"],
		previewTool: "getInvoice",
		scopes: ["billing:write"],
		toolName: "voidInvoice",
	},
];
