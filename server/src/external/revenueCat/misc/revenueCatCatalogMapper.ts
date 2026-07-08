import type { AppEnv } from "@shared/index";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import type { initRevenuecatCli } from "@/external/revenueCat/misc/initRevenuecatCli";

type RevenueCatCli = ReturnType<typeof initRevenuecatCli>;
type StoreIdentifierByProductId = Map<string, string>;

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

const catalogCache = new Map<
	string,
	{ map: StoreIdentifierByProductId; expiresAt: number }
>();

const catalogCacheKey = (orgId: string, env: AppEnv) => `${orgId}:${env}`;

/**
 * RC-internal product id -> store_identifier map, built from listAllProducts and
 * cached per org/env (RC catalogs change rarely).
 */
export const getRevenueCatStoreIdentifierMap = async ({
	rcCli,
	orgId,
	env,
	logger,
	forceRefresh = false,
}: {
	rcCli: RevenueCatCli;
	orgId: string;
	env: AppEnv;
	logger?: Logger;
	forceRefresh?: boolean;
}): Promise<StoreIdentifierByProductId> => {
	const key = catalogCacheKey(orgId, env);
	const cached = catalogCache.get(key);
	if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
		return cached.map;
	}

	const products = await rcCli.listAllProducts();
	const map: StoreIdentifierByProductId = new Map();
	for (const product of products) {
		map.set(product.id, product.store_identifier);
	}

	catalogCache.set(key, { map, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS });

	logger
		?.child({
			context: {
				extras: {
					rc_catalog_map_built: true,
					org_id: orgId,
					env,
					product_count: products.length,
				},
			},
		})
		.info("Built RevenueCat catalog store-identifier map");

	return map;
};

/**
 * Resolve a RevenueCat-internal product id to an Autumn product id, chaining
 * RC-internal id -> store_identifier -> Autumn product (pure-DB RCMappingService).
 */
export const mapRevenueCatProductToAutumn = async ({
	db,
	orgId,
	env,
	revenueCatInternalProductId,
	rcCli,
	storeIdentifierMap,
	logger,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	revenueCatInternalProductId: string;
	rcCli?: RevenueCatCli;
	storeIdentifierMap?: StoreIdentifierByProductId;
	logger?: Logger;
}): Promise<string | null> => {
	let map = storeIdentifierMap;
	if (!map) {
		if (!rcCli) {
			throw new Error(
				"mapRevenueCatProductToAutumn requires rcCli or storeIdentifierMap",
			);
		}
		map = await getRevenueCatStoreIdentifierMap({ rcCli, orgId, env, logger });
	}

	const storeIdentifier = map.get(revenueCatInternalProductId);
	if (!storeIdentifier) {
		logger
			?.child({
				context: {
					extras: {
						rc_catalog_miss: true,
						revenuecat_internal_product_id: revenueCatInternalProductId,
					},
				},
			})
			.warn("RevenueCat internal product id not found in catalog");
		return null;
	}

	const autumnProductId = await RCMappingService.getAutumnProductId({
		db,
		orgId,
		env,
		revenuecatProductId: storeIdentifier,
	});

	logger
		?.child({
			context: {
				extras: {
					rc_product_resolved: true,
					revenuecat_internal_product_id: revenueCatInternalProductId,
					store_identifier: storeIdentifier,
					autumn_product_id: autumnProductId,
				},
			},
		})
		.info("Resolved RevenueCat product to Autumn product");

	return autumnProductId;
};
