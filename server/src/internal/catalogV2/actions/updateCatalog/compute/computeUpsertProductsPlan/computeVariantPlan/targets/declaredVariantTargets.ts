import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { selectVariantRows } from "../selectVariantRows";
import { reachInternalIdsForBaseUpsert } from "../variantPlanUtils";
import type { VariantEditTarget } from "./variantEditTarget";

/** variants[] entries over existing rows → declared targets (repoint / customize / archive / unlink). */
export const declaredVariantTargets = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): VariantEditTarget[] => {
	const unlinkableBaseIds = new Set([
		...reachInternalIdsForBaseUpsert({ upsert }),
		upsert.row.nextFullProduct.internal_id,
	]);

	return (upsert.declaredVariants ?? []).flatMap(
		(variant): VariantEditTarget[] => {
			// Link/unlink change the plan relationship, not one row: detaching
			// clears every version, and first-linking a standalone claims every version.
			const unlink = variant.base_variant_id === null;
			const planRows =
				productStatesContext.versionsByPlanId[variant.variant_plan_id] ?? [];
			const firstLink =
				planRows.length > 0 &&
				planRows.every((row) => row.base_internal_product_id == null);
			const rows = selectVariantRows({
				planId: variant.variant_plan_id,
				version: variant.version,
				versionSlug: variant.version_slug,
				allVersions:
					unlink || firstLink || upsert.row.versioning === "all_versions",
				productStatesContext,
			});

			if (unlink) {
				return rows
					.filter(
						(row) =>
							row.base_internal_product_id != null &&
							unlinkableBaseIds.has(row.base_internal_product_id),
					)
					.map((row) => ({ row, unlink: true }));
			}

			return rows.map((row) => ({
				row,
				declared: true,
				...(variant.customize ? { customize: variant.customize } : {}),
				...(variant.processors !== undefined
					? { processors: variant.processors }
					: {}),
				...(variant.archived !== undefined
					? { archived: variant.archived }
					: {}),
				...(variant.new_version_slug
					? { newVersionSlug: variant.new_version_slug }
					: {}),
			}));
		},
	);
};
