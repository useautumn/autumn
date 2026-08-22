import type { UpdateCatalogParams } from "@autumn/shared";
import { resolveAliasReplacement } from "@/internal/catalogV2/productAliases/resolveAliasReplacement";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";

const renameIfExisting = ({
	planId,
	toId,
	productStatesContext,
	aliases,
}: {
	planId: string;
	toId: string;
	productStatesContext: ProductStatesContext;
	aliases?: Record<string, string>;
}): RenameProductPlan[] => {
	if (toId === planId) return [];
	const versions = productStatesContext.versionsByPlanId[planId] ?? [];
	if (versions.length === 0) return [];

	return [
		{
			planId,
			toId,
			aliasReplacement: resolveAliasReplacement({ claimedId: toId, aliases }),
		},
	];
};

/**
 * One rename per existing plan with a differing new_plan_id. Creates carry
 * the new id on the row itself — no references exist yet, nothing to move.
 */
export const computeRenameProductIdsPlan = ({
	params,
	productStatesContext,
	aliases,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	aliases?: Record<string, string>;
}): RenameProductPlan[] =>
	params.plans.flatMap((planParams) => [
		...(planParams.new_plan_id
			? renameIfExisting({
					planId: planParams.plan_id,
					toId: planParams.new_plan_id,
					productStatesContext,
					aliases,
				})
			: []),
		...(planParams.variants ?? []).flatMap((variant) =>
			variant.new_plan_id
				? renameIfExisting({
						planId: variant.variant_plan_id,
						toId: variant.new_plan_id,
						productStatesContext,
						aliases,
					})
				: [],
		),
	]);
