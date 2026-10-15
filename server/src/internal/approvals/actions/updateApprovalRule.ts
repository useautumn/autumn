import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApprovalRule } from "./getApprovalRule.js";
import { saveApprovalRule } from "./saveApprovalRule.js";

/** PATCH semantics: the given fields replace the stored ones, and the merged rule is re-validated whole. */
export const updateApprovalRule = async ({
	ctx,
	ruleId,
	params,
}: {
	ctx: AutumnContext;
	ruleId: string;
	params: Record<string, unknown>;
}) => {
	const { name, subjects, actions, when, note, enabled } =
		await getApprovalRule({
			ctx,
			ruleId,
		});
	return saveApprovalRule({
		ctx,
		ruleId,
		params: { name, subjects, actions, when, note, enabled, ...params },
	});
};
