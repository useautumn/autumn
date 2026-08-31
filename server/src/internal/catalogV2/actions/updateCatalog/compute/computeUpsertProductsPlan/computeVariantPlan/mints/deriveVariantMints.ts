import type { UpdateCatalogPlanParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { rowHasVersionableCustomers } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/rowHasVersionableCustomers";
import { buildVariantEditDiff } from "../editDiff/buildVariantEditDiff";
import type { VariantEditTarget } from "../targets/variantEditTarget";
import { baseRowMinted } from "../variantPlanUtils";

/**
 * Base `new_version`: a content edit that would hit the resolved variant row
 * with customers mints the next version from it instead of editing in place.
 */
export const deriveVariantMints = ({
	intent,
	upsert,
	targets,
	settingsPatch,
	projectedProductStatesContext,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	targets: VariantEditTarget[];
	settingsPatch: Partial<UpdateCatalogPlanParams>;
	projectedProductStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	if (upsert.row.versioning !== "new_version") return [];

	const pointer = baseRowMinted({ upsert })
		? upsert.row.nextFullProduct.internal_id
		: undefined;

	return targets.flatMap((target): ProductUpsertIntent[] => {
		const carriesContent = target.follow === true || target.customize != null;
		if (!carriesContent) return [];
		if (
			!rowHasVersionableCustomers({
				row: target.row,
				productStatesContext: projectedProductStatesContext,
			})
		) {
			return [];
		}

		const editDiff = buildVariantEditDiff({
			variantProduct: target.row,
			baseCurrent: upsert.row.currentFullProduct ?? upsert.row.baseFullProduct,
			baseNext: upsert.row.nextFullProduct,
			follow: target.follow === true,
			customize: target.customize,
			declaredLicenses: upsert.declaredLicenses,
		});
		const version =
			maxVersionForPlan({
				planId: target.row.id,
				productStatesContext: projectedProductStatesContext,
			}) + 1;

		return [
			{
				productKey: { planId: target.row.id, version },
				planParams: {
					plan_id: target.row.id,
					version,
					versioning: "new_version",
					...(intent.planParams.active === true ? { active: true } : {}),
					...(target.newVersionSlug
						? { new_version_slug: target.newVersionSlug }
						: {}),
					...settingsPatch,
				},
				source: "variant_propagation",
				...(editDiff ? { editDiff } : {}),
				...(pointer !== undefined ? { baseInternalProductId: pointer } : {}),
			},
		];
	});
};
