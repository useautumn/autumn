import type { UpdateCatalogParams } from "@autumn/shared";
import type { InternalIdRefs } from "@/internal/catalogV2/actions/updateCatalog/setup/resolveInternalIdRefs";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { resolveAliasReplacement } from "@/internal/catalogV2/productAliases/resolveAliasReplacement";

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
/**
 * A row addressed by internal_id under a different plan_id IS a rename — the
 * config states where the row should live now, and does not have to remember
 * the name it used to use.
 */
const renameFromInternalId = ({
	planParams,
	internalIdRefs,
	productStatesContext,
	aliases,
}: {
	planParams: NonNullable<UpdateCatalogParams["plans"]>[number];
	internalIdRefs: InternalIdRefs;
	productStatesContext: ProductStatesContext;
	aliases?: Record<string, string>;
}): RenameProductPlan[] => {
	if (!planParams.internal_id || planParams.new_plan_id) return [];
	const ref = internalIdRefs.get(planParams.internal_id);
	if (!ref) return [];
	return renameIfExisting({
		planId: ref.planId,
		toId: planParams.plan_id,
		productStatesContext,
		aliases,
	});
};

export const computeRenameProductIdsPlan = ({
	params,
	productStatesContext,
	internalIdRefs,
	aliases,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	internalIdRefs: InternalIdRefs;
	aliases?: Record<string, string>;
}): RenameProductPlan[] =>
	(params.plans ?? []).flatMap((planParams) => [
		...renameFromInternalId({
			planParams,
			internalIdRefs,
			productStatesContext,
			aliases,
		}),
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
