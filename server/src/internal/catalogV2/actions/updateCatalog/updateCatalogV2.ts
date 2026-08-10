import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpdateCatalogPlan";
import { handleUpdateCatalogErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpdateCatalogErrors";
import { setupUpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupUpdateCatalogContext";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import {
	type CatalogResult,
	executeUpdateCatalogPlan,
} from "@/internal/catalogV2/execute/executeUpdateCatalogPlan";

export type UpdateCatalogActionResult = {
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
	/** Absent on preview runs — nothing was written. */
	catalogResult?: CatalogResult;
};

export async function updateCatalogV2({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	preview?: boolean;
}): Promise<UpdateCatalogActionResult> {
	// 1. Setup — all DB reads; preview adds previewContext presentation facts
	const catalogContext = await setupUpdateCatalogContext({
		ctx,
		params,
		preview,
	});

	// 2. Compute
	const updateCatalogPlan = computeUpdateCatalogPlan({
		ctx,
		catalogContext,
		params,
	});

	// 3. Errors
	handleUpdateCatalogErrors({ ctx, catalogContext, updateCatalogPlan });

	if (preview) {
		return { catalogContext, updateCatalogPlan };
	}

	// 4. Execute
	const catalogResult = await executeUpdateCatalogPlan({
		ctx,
		updateCatalogPlan,
	});

	return { catalogContext, updateCatalogPlan, catalogResult };
}
