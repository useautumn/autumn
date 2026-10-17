import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleApprovalCan } from "./handlers/handleApprovalCan.js";
import { handleCreateApprovalRule } from "./handlers/handleCreateApprovalRule.js";
import { handleDeleteApprovalRule } from "./handlers/handleDeleteApprovalRule.js";
import { handleGetApprovalRule } from "./handlers/handleGetApprovalRule.js";
import { handleListApprovalRules } from "./handlers/handleListApprovalRules.js";
import { handleListApprovalRuleVersions } from "./handlers/handleListApprovalRuleVersions.js";
import { handleReorderApprovalRules } from "./handlers/handleReorderApprovalRules.js";
import { handleUpdateApprovalRule } from "./handlers/handleUpdateApprovalRule.js";

/** Approval rules, mounted on the dashboard router and on /v1. */
export const approvalRulesRpcRouter = new Hono<HonoEnv>();

approvalRulesRpcRouter.post("/approval_rules.list", ...handleListApprovalRules);
approvalRulesRpcRouter.post("/approval_rules.get", ...handleGetApprovalRule);
approvalRulesRpcRouter.post(
	"/approval_rules.create",
	...handleCreateApprovalRule,
);
approvalRulesRpcRouter.post(
	"/approval_rules.update",
	...handleUpdateApprovalRule,
);
approvalRulesRpcRouter.post(
	"/approval_rules.delete",
	...handleDeleteApprovalRule,
);
approvalRulesRpcRouter.post(
	"/approval_rules.reorder",
	...handleReorderApprovalRules,
);
approvalRulesRpcRouter.post(
	"/approval_rules.versions.list",
	...handleListApprovalRuleVersions,
);
approvalRulesRpcRouter.post("/approvals.can", ...handleApprovalCan);
