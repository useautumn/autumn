import type { RouteScopeRequirement } from "@autumn/shared";
import type { LeafAgentConnection } from "./toolAllowlists.js";

type GatedWrite = {
	agents: readonly LeafAgentConnection[];
	previewTool?: string;
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
		toolName: "attach",
	},
	{
		agents: ["leaf"],
		previewTool: "previewCreateBalance",
		scopes: ["balances:write"],
		toolName: "createBalance",
	},
	{
		agents: ["leaf"],
		toolName: "createEntity",
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
	{
		agents: ["leaf"],
		previewTool: "previewCreateSchedule",
		scopes: ["billing:write"],
		toolName: "createSchedule",
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
		toolName: "updateSubscription",
	},
];
