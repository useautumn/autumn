import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { buildLicenseParentsPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildLicenseParentsPreview";
import { buildLicensesPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildLicensesPreview";
import { buildRemovePlansPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildRemovePlansPreview";
import { aliasReplacementForPlan } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/aliasReplacementForPlan";
import { buildVariantsPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildVariantsPreview";
import { buildPlanVersioning } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildPlanVersioning";
import {
	catalogRowIdentity,
	promotionDetailsForPlan,
} from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { buildSiblingVersionsPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildSiblingVersionsPreview";
import { buildPlanUsage } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { upsertToCatalogAction } from "@/internal/catalogV2/actions/updateCatalog/utils/upsertToCatalogAction";

type PlanPreview = PreviewUpdateCatalogResponse["plans"][number];

/** Pure map: direct upsertProducts + removePlans → preview plan rows. */
export const buildPlansPreview = ({
	updateCatalogPlan,
	catalogContext,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	catalogContext: UpdateCatalogContext;
}): PreviewUpdateCatalogResponse["plans"] => {
	const { upsertProducts } = updateCatalogPlan;
	const productStatesContext = catalogContext.productStatesContext;

	const upsertRows = upsertProducts.flatMap((upsert) => {
		if (upsert.row.source !== "direct") return [];

		const planChange = buildPlanChangeFromFullProducts({
			from:
				upsert.row.baseFullProduct ??
				upsert.row.currentFullProduct ??
				undefined,
			to: upsert.row.nextFullProduct,
		});
		const siblingVersions = buildSiblingVersionsPreview({
			directUpsert: upsert,
			upsertProducts,
			productStatesContext,
			previewContext: catalogContext.previewContext,
			renamePlans: updateCatalogPlan.renamePlans,
		});
		const licenseParents = buildLicenseParentsPreview({
			directUpsert: upsert,
			upsertProducts,
			productStatesContext,
			previewContext: catalogContext.previewContext,
		});
		const licenses = buildLicensesPreview({ upsert });
		const variants = buildVariantsPreview({
			directUpsert: upsert,
			upsertProducts,
			productStatesContext,
			previewContext: catalogContext.previewContext,
			renamePlans: updateCatalogPlan.renamePlans,
		});
		const aliasReplacement = aliasReplacementForPlan({
			planId: upsert.row.planId,
			upsert,
			renamePlans: updateCatalogPlan.renamePlans,
		});
		const previousActive = upsert.previousActiveInternalId
			? findFullProductByInternalId({
					internalId: upsert.previousActiveInternalId,
					productStatesContext,
				})
			: null;
		const promotionDetails = promotionDetailsForPlan({
			previousActive,
		});

		return [
			{
				...catalogRowIdentity({
					planId: upsert.row.planId,
					version: upsert.row.version,
					current: upsert.row.currentFullProduct,
					next: upsert.row.nextFullProduct,
				}),
				...(promotionDetails ? { promotion_details: promotionDetails } : {}),
				name: upsert.row.nextFullProduct.name,
				action: upsertToCatalogAction({ upsert }),
				state: {
					has_customers: upsert.state.hasCustomers,
					will_archive: false,
					usage: buildPlanUsage({
						rows: [
							{
								planId: upsert.row.planId,
								version: upsert.row.version,
								current: upsert.row.currentFullProduct,
								willArchive: false,
								willTombstone: false,
								hasCustomers: upsert.state.hasCustomers,
								allVersions: false,
							},
						],
						previewContext: catalogContext.previewContext,
						productStatesContext,
					}),
					reasons: [],
				},
				versioning: buildPlanVersioning({
					upsert,
					versionsForPlan:
						productStatesContext.versionsByPlanId[upsert.row.planId] ?? [],
					productStatesContext,
				}),
				...(planChange ? { plan_change: planChange } : {}),
				...(siblingVersions.length > 0
					? { sibling_versions: siblingVersions }
					: {}),
				...(licenseParents.length > 0
					? { license_parents: licenseParents }
					: {}),
				...(variants.length > 0 ? { variants } : {}),
				...(licenses.length > 0 ? { licenses } : {}),
				...(aliasReplacement ? { alias_replacement: aliasReplacement } : {}),
			},
		];
	});

	const removeRows = buildRemovePlansPreview({
		removePlans: updateCatalogPlan.removePlans,
		catalogContext,
	});

	return [...upsertRows, ...removeRows];
};
