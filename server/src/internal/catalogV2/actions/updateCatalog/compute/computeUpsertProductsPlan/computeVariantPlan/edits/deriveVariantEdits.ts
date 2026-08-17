import type { FullProduct, UpdateCatalogPlanParams } from "@autumn/shared";
import { isEmptyObject } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { buildVariantEditDiff } from "../editDiff/buildVariantEditDiff";
import { variantSettingsPlanParams } from "../editDiff/variantSettingsPlanParams";
import { baseRowMinted } from "../variantPlanUtils";
import {
	resolveVariantEditTargets,
	type VariantEditTarget,
} from "./resolveVariantEditTargets";

const variantProductAt = ({
	planId,
	version,
	productStatesContext,
}: {
	planId: string;
	version: number;
	productStatesContext: ProductStatesContext;
}): FullProduct | undefined =>
	(productStatesContext.versionsByPlanId[planId] ?? []).find(
		(product) => product.version === version,
	);

const latestVersionOf = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): number | undefined =>
	productStatesContext.versionsByPlanId[planId]?.[0]?.version;

/** One target row → one intent, or undefined when nothing would change. */
const buildVariantEditIntent = ({
	target,
	upsert,
	baseCurrent,
	settingsPatch,
	newBasePointer,
	productStatesContext,
}: {
	target: VariantEditTarget;
	upsert: UpsertProductPlan;
	baseCurrent: FullProduct | null;
	settingsPatch: Partial<UpdateCatalogPlanParams>;
	newBasePointer: string | undefined;
	productStatesContext: ProductStatesContext;
}): ProductUpsertIntent | undefined => {
	const variantProduct = variantProductAt({
		planId: target.planId,
		version: target.version,
		productStatesContext,
	});
	if (!variantProduct) return undefined;

	const editDiff = buildVariantEditDiff({
		variantProduct,
		baseCurrent,
		baseNext: upsert.row.nextFullProduct,
		follow: target.follow,
		customize: target.customize,
		declaredLicenses: upsert.declaredLicenses,
	});
	const hasSettings = !isEmptyObject(settingsPatch);
	if (!editDiff && !hasSettings && newBasePointer === undefined) {
		return undefined;
	}

	// The base pointer only moves on the variant's latest version.
	const repointToNewBase =
		newBasePointer !== undefined &&
		target.version ===
			latestVersionOf({ planId: target.planId, productStatesContext });
	const pointerIsOnlyChange =
		!target.follow && !editDiff && !hasSettings && repointToNewBase;

	return {
		productKey: { planId: target.planId, version: target.version },
		planParams: {
			plan_id: target.planId,
			version: target.version,
			...settingsPatch,
		},
		source: pointerIsOnlyChange ? "repoint" : "variant_propagation",
		...(editDiff ? { editDiff } : {}),
		...(repointToNewBase ? { baseInternalProductId: newBasePointer } : {}),
	};
};

/**
 * Existing ids: merge propagate, declare customize, settings, and pointer.
 * Width follows the folded base (`all_versions`); settings stay latest-only.
 */
export const deriveVariantEdits = ({
	upsert,
	projectedProductStatesContext,
	mintedPlanIds = new Set(),
}: {
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
	mintedPlanIds?: Set<string>;
}): ProductUpsertIntent[] => {
	const baseCurrent =
		upsert.row.currentFullProduct ?? upsert.row.baseFullProduct;
	const settingsPatch = variantSettingsPlanParams({
		current: baseCurrent,
		next: upsert.row.nextFullProduct,
	});
	const newBasePointer = baseRowMinted({ upsert })
		? upsert.row.nextFullProduct.internal_id
		: undefined;

	const targets = resolveVariantEditTargets({
		upsert,
		productStatesContext: projectedProductStatesContext,
		sweepLatestVariants:
			!isEmptyObject(settingsPatch) || newBasePointer !== undefined,
		mintedPlanIds,
	});

	return targets.flatMap(
		(target) =>
			buildVariantEditIntent({
				target,
				upsert,
				baseCurrent,
				settingsPatch,
				newBasePointer,
				productStatesContext: projectedProductStatesContext,
			}) ?? [],
	);
};
