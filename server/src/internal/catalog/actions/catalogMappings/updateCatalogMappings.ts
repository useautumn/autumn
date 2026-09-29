import { clearOrgWithFeaturesCache } from "@autumn/cache";
import type {
	CatalogUpdateMappingsParams,
	CatalogUpdateMappingsResponse,
} from "@autumn/shared";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { invalidateOrgCatalog } from "../invalidateOrgCatalog.js";
import { getCatalogMappings } from "./getCatalogMappings.js";
import {
	applyFeatureMappings,
	assertMappedFeaturesExist,
} from "./updateMappings/applyFeatureMappings.js";
import { applyItemMappings } from "./updateMappings/applyItemMappings.js";
import { applyPlanMappings } from "./updateMappings/applyPlanMappings.js";
import {
	applyPriceMappings,
	validatePriceMappings,
} from "./updateMappings/applyPriceMappings.js";
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

	// Stripe side effects rule out a transaction, so reject bad input before any write.
	assertMappedFeaturesExist({ ctx, params });
	const adoptedStripePrices =
		params.price_mappings.length > 0
			? await validatePriceMappings({
					ctx,
					params,
					products: await listEveryVersion({ ctx }),
				})
			: new Map();

	try {
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
				adoptedStripePrices,
			});
		}
	} finally {
		await invalidateOrgCatalog({ ctx, orgId: org.id, env });
		if (params.feature_mappings.length > 0) {
			await clearOrgWithFeaturesCache({
				ctx: getMiscCacheContext(),
				orgId: org.id,
				env,
			});
		}
	}

	return getCatalogMappings({ ctx, params });
};
