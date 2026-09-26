import type {
	CatalogUpdateMappingsParams,
	CatalogUpdateMappingsResponse,
} from "@autumn/shared";
import { clearOrgWithFeaturesCache } from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getCatalogMappings } from "./getCatalogMappings.js";
import { applyFeatureMappings } from "./updateMappings/applyFeatureMappings.js";
import { applyItemMappings } from "./updateMappings/applyItemMappings.js";
import { applyPlanMappings } from "./updateMappings/applyPlanMappings.js";
import { applyPriceMappings } from "./updateMappings/applyPriceMappings.js";
import { loadMappingContexts } from "./updateMappings/loadMappingContexts.js";
import { persistPriceTargets } from "./updateMappings/persistPriceTargets.js";
import {
	assertUniquePlanMappings,
	getCatalogMappingPlanIds,
	type PriceTargets,
} from "./updateMappings/updateMappingUtils.js";

const listEveryVersion = ({ ctx }: { ctx: AutumnContext }) =>
	ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
		skipCache: true,
	});

const hasNoMappings = ({
	params,
	planIds,
}: {
	params: CatalogUpdateMappingsParams;
	planIds: string[];
}) =>
	planIds.length === 0 &&
	params.feature_mappings.length === 0 &&
	params.price_mappings.length === 0;

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
	if (hasNoMappings({ params, planIds })) {
		return getCatalogMappings({ ctx, params });
	}

	const priceTargets: PriceTargets = new Map();
	if (planIds.length > 0) {
		const contextsByPlanId = await loadMappingContexts({ ctx, planIds });
		await applyPlanMappings({ ctx, params, contextsByPlanId, priceTargets });
		applyItemMappings({ params, contextsByPlanId, priceTargets });
	}

	if (params.feature_mappings.length > 0) {
		await applyFeatureMappings({
			ctx,
			params,
			products: await listEveryVersion({ ctx }),
			priceTargets,
		});
	}
	await persistPriceTargets({ ctx, priceTargets });

	// Explicit price picks win over the feature default, so they land last.
	if (params.price_mappings.length > 0) {
		await applyPriceMappings({
			ctx,
			params,
			products: await listEveryVersion({ ctx }),
		});
	}

	await invalidateProductsCache({ orgId: org.id, env });
	if (params.feature_mappings.length > 0) {
		await clearOrgWithFeaturesCache({ orgId: org.id, env });
	}

	return getCatalogMappings({ ctx, params });
};
