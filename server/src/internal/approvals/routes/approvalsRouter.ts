import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateApprovalRule } from "../handlers/handleCreateApprovalRule.js";
import { handleDeleteApprovalRule } from "../handlers/handleDeleteApprovalRule.js";
import { handleGetApprovalRule } from "../handlers/handleGetApprovalRule.js";
import { handleListApprovalRules } from "../handlers/handleListApprovalRules.js";
import { handleListApprovalRuleVersions } from "../handlers/handleListApprovalRuleVersions.js";
import { handleUpdateApprovalRule } from "../handlers/handleUpdateApprovalRule.js";

export const approvalsRouter = new Hono<HonoEnv>();

approvalsRouter.get("/rules", ...handleListApprovalRules);
approvalsRouter.post("/rules", ...handleCreateApprovalRule);
approvalsRouter.get("/rules/:id", ...handleGetApprovalRule);
approvalsRouter.patch("/rules/:id", ...handleUpdateApprovalRule);
approvalsRouter.delete("/rules/:id", ...handleDeleteApprovalRule);
approvalsRouter.get("/rules/:id/versions", ...handleListApprovalRuleVersions);
