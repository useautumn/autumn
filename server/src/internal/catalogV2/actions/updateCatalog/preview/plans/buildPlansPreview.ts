import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { buildPlanVersioning } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildPlanVersioning";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
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

/** Pure map: upsertProducts → preview plan rows. */
export const buildPlansPreview = ({
	updateCatalogPlan,
	productStatesContext,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	productStatesContext: ProductStatesContext;
}): PreviewUpdateCatalogResponse["plans"] =>
	updateCatalogPlan.upsertProducts.map((upsert) => {
		const planChange = buildPlanChangeFromFullProducts({
			from:
				upsert.row.baseFullProduct ??
				upsert.row.currentFullProduct ??
				undefined,
			to: upsert.row.nextFullProduct,
		});

		return {
			plan_id: upsert.row.planId,
			name: upsert.row.nextFullProduct.name,
			action: upsertOpToAction({ op: upsert.row.op }),
			state: {
				has_customers: upsert.state.hasCustomers,
				will_archive: false,
			},
			versioning: buildPlanVersioning({
				upsert,
				versionsForPlan:
					productStatesContext.versionsByPlanId[upsert.row.planId] ?? [],
			}),
			...(planChange ? { plan_change: planChange } : {}),
		};
	});
