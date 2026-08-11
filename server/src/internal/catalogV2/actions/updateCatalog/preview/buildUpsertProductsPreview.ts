import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
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
export const buildUpsertProductsPreview = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): PreviewUpdateCatalogResponse["plans"] =>
	updateCatalogPlan.upsertProducts.map((upsert) => ({
		plan_id: upsert.row.planId,
		name: upsert.row.nextFullProduct.name,
		action: upsertOpToAction({ op: upsert.row.op }),
		state: {
			has_customers: upsert.state.hasCustomers,
			will_archive: false,
		},
		versioning: null,
		changes: null,
	}));
