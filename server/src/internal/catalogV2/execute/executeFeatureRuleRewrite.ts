import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { rewriteApprovalRuleIds } from "@/internal/approvals/renames/rewriteApprovalRuleIds";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";

/** Moves approval rules onto a renamed feature's id. Call it right after that feature is saved, so the two stay paired. */
export const executeFeatureRuleRewrite = async ({
	ctx,
	updateFeaturePlan,
}: {
	ctx: AutumnContext;
	updateFeaturePlan: UpdateFeaturePlan;
}) => {
	const { idChange } = updateFeaturePlan.rewrites;
	if (!idChange) return;
	await rewriteApprovalRuleIds({ ctx, key: "feature_id", ...idChange });
};
