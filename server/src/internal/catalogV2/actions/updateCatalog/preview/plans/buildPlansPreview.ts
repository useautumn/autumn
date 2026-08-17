import {
	emptyCatalogPlanUsage,
	type PreviewUpdateCatalogResponse,
} from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { buildLicenseParentsPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildLicenseParentsPreview";
import { buildLicensesPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildLicensesPreview";
import { buildRemovePlansPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildRemovePlansPreview";
import { buildVariantsPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildVariantsPreview";
import { buildPlanVersioning } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildPlanVersioning";
import { buildSiblingVersionsPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildSiblingVersionsPreview";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

type PlanPreview = PreviewUpdateCatalogResponse["plans"][number];

const upsertOpToAction = ({
	op,
}: {
	op: UpsertProductPlan["row"]["op"];
}): PlanPreview["action"] => {
	if (op === "create") return "create";
	if (op === "update") return "update";
	return "none";
};

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
		});
		const licenseParents = buildLicenseParentsPreview({
			directUpsert: upsert,
			upsertProducts,
			productStatesContext,
		});
		const licenses = buildLicensesPreview({ upsert });
		const variants = buildVariantsPreview({
			directUpsert: upsert,
			upsertProducts,
			productStatesContext,
		});

		return [
			{
				plan_id: upsert.row.planId,
				version: upsert.row.version,
				name: upsert.row.nextFullProduct.name,
				action: upsertOpToAction({ op: upsert.row.op }),
				state: {
					has_customers: upsert.state.hasCustomers,
					will_archive: false,
					usage: emptyCatalogPlanUsage(),
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
			},
		];
	});

	const removeRows = buildRemovePlansPreview({
		removePlans: updateCatalogPlan.removePlans,
		catalogContext,
	});

	return [...upsertRows, ...removeRows];
};
