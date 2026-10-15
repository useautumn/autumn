import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { saveApprovalRule } from "./saveApprovalRule.js";

export const createApprovalRule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: unknown;
}) => saveApprovalRule({ ctx, ruleId: generateId("apr"), params });
