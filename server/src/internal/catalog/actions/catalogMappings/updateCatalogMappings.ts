import type {
	CatalogUpdateMappingsParams,
	CatalogUpdateMappingsResponse,
} from "@autumn/shared";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCatalogMappings } from "./getCatalogMappings.js";
import { applyItemMappings } from "./updateMappings/applyItemMappings.js";
import { applyPlanMappings } from "./updateMappings/applyPlanMappings.js";
import { loadMappingContexts } from "./updateMappings/loadMappingContexts.js";
import { persistPriceTargets } from "./updateMappings/persistPriceTargets.js";
import {
	assertUniquePlanMappings,
	getCatalogMappingPlanIds,
	type PriceTargets,
} from "./updateMappings/updateMappingUtils.js";

export const updateCatalogMappings = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateMappingsParams;
}): Promise<CatalogUpdateMappingsResponse> => {
	const { org, env } = ctx;
	assertUniquePlanMappings({ params });

	const planIds = getCatalogMappingPlanIds(params);
	if (planIds.length === 0) {
		return getCatalogMappings({ ctx, params });
	}

	const contextsByPlanId = await loadMappingContexts({ ctx, planIds });
	const priceTargets: PriceTargets = new Map();

	await applyPlanMappings({ ctx, params, contextsByPlanId, priceTargets });
	applyItemMappings({ params, contextsByPlanId, priceTargets });
	await persistPriceTargets({ ctx, priceTargets });

	await invalidateProductsCache({ orgId: org.id, env });

	return getCatalogMappings({ ctx, params });
};
