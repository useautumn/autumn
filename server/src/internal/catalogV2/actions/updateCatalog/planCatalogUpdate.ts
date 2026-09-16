import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpdateCatalogPlan";
import { setupUpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupUpdateCatalogContext";
import {
	type CatalogPhases,
	timeCatalogPhase,
} from "@/internal/catalogV2/actions/updateCatalog/setup/timeCatalogPhase";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

export const planCatalogUpdate = async ({
	ctx,
	params,
	preview,
	phases,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	preview: boolean;
	phases: CatalogPhases;
}): Promise<{
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}> => {
	const catalogContext = await setupUpdateCatalogContext({
		ctx,
		params,
		preview,
		phases,
	});
	const updateCatalogPlan = await timeCatalogPhase({
		ctx,
		phases,
		phase: "compute",
		run: async () =>
			computeUpdateCatalogPlan({
				ctx,
				catalogContext,
				params,
			}),
	});

	return { catalogContext, updateCatalogPlan };
};
