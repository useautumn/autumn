import { isEmptyObject } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { deriveVariantCreates } from "./creates/deriveVariantCreates";
import { variantSettingsPlanParams } from "./editDiff/variantSettingsPlanParams";
import { deriveVariantEdits } from "./edits/deriveVariantEdits";
import { deriveVariantMints } from "./mints/deriveVariantMints";
import { resolveVariantEditTargets } from "./targets/resolveVariantEditTargets";

export const computeVariantPlan = ({
	intent,
	upsert,
	projectedProductStatesContext,
	claimedProductKeys,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
	claimedProductKeys?: Set<string>;
}): ProductUpsertIntent[] => {
	const settingsPatch = variantSettingsPlanParams({
		current: upsert.row.currentFullProduct ?? upsert.row.baseFullProduct,
		next: upsert.row.nextFullProduct,
	});
	const targets = resolveVariantEditTargets({
		upsert,
		productStatesContext: projectedProductStatesContext,
		includeSettingsTargets: !isEmptyObject(settingsPatch),
	});

	const mints = deriveVariantMints({
		intent,
		upsert,
		targets,
		settingsPatch,
		projectedProductStatesContext,
	});
	const mintedPlanIds = new Set(mints.map((mint) => mint.productKey.planId));
	const edits = deriveVariantEdits({
		upsert,
		targets: targets.filter((target) => !mintedPlanIds.has(target.row.id)),
		settingsPatch,
	});

	return [
		...deriveVariantCreates({
			upsert,
			projectedProductStatesContext,
			claimedProductKeys,
		}),
		...mints,
		...edits,
	];
};
