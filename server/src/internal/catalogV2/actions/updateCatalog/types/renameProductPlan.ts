import type { PlanAliasReplacement } from "@autumn/shared";

export type RenameProductPlan = {
	planId: string;
	toId: string;
	aliasReplacement?: PlanAliasReplacement;
};
