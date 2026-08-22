import type { PlanAliasReplacement } from "@autumn/shared";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export const aliasReplacementForPlan = ({
	planId,
	upsert,
	renamePlans,
}: {
	planId: string;
	upsert?: UpsertProductPlan;
	renamePlans: RenameProductPlan[];
}): PlanAliasReplacement | undefined =>
	upsert?.aliasReplacement ??
	renamePlans.find((rename) => rename.planId === planId)?.aliasReplacement;
