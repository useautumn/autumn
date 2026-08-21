import type { RouteScopeRequirement } from "@autumn/shared";
import type { LeafAgentConnection } from "./toolAllowlists.js";

type GatedWrite = {
	/** Subagents whose toolset exposes (and gates) this write. */
	agents: readonly Exclude<LeafAgentConnection, "investigator">[];
	/** Preview twin used to backfill the approval card; absent = no preview. */
	previewTool?: string;
	/** Per-user scopes required to approve; absent = fails closed at decide. */
	scopes?: RouteScopeRequirement;
	toolName: string;
};

/** The one authoritative table of approval-gated writes. Everything else —
 * per-agent approval sets, decide-time scope requirements, write→preview
 * mapping — derives from here. */
export const GATED_WRITES: readonly GatedWrite[] = [
	{
		agents: ["billing"],
		previewTool: "previewAttach",
		scopes: ["billing:write"],
		toolName: "attach",
	},
	{
		agents: ["billing"],
		previewTool: "previewCreateBalance",
		scopes: ["balances:write"],
		toolName: "createBalance",
	},
	{
		agents: ["billing"],
		toolName: "createEntity",
	},
	{
		agents: ["catalog", "orchestrator"],
		previewTool: "previewUpdateCatalog",
		scopes: ["plans:write"],
		toolName: "createPlan",
	},
	{
		agents: ["catalog", "orchestrator"],
		previewTool: "previewUpdateCatalog",
		scopes: ["rewards:write"],
		toolName: "createReward",
	},
	{
		agents: ["billing"],
		previewTool: "previewCreateSchedule",
		scopes: ["billing:write"],
		toolName: "createSchedule",
	},
	{
		agents: ["orchestrator"],
		toolName: "updateAgentRules",
	},
	{
		agents: ["catalog", "orchestrator"],
		previewTool: "previewUpdateCatalog",
		scopes: { ALL: ["plans:write", "features:write"] },
		toolName: "updateCatalog",
	},
	{
		agents: ["billing"],
		scopes: ["customers:write"],
		toolName: "updateCustomer",
	},
	{
		agents: ["catalog", "orchestrator"],
		previewTool: "previewUpdateCatalog",
		scopes: ["plans:write"],
		toolName: "updatePlan",
	},
	{
		agents: ["billing"],
		previewTool: "previewUpdateSubscription",
		scopes: ["billing:write"],
		toolName: "updateSubscription",
	},
];
