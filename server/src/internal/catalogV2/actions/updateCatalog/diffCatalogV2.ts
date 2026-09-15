import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { assertRewardScope } from "@/internal/catalogV2/actions/updateCatalog/errors/assertRewardScope";
import { planCatalogUpdate } from "@/internal/catalogV2/actions/updateCatalog/planCatalogUpdate";

/** Compute the catalog delta without validating or executing the proposed mutation. */
export const diffCatalogV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}) => {
	assertRewardScope({ ctx, params, preview: true });
	return planCatalogUpdate({ ctx, params, preview: true, phases: {} });
};
