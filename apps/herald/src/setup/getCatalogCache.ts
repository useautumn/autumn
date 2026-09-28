import { type CatalogCache, createCatalogCache } from "@autumn/catalog-lru";
import {
	BALANCE_WORKER_CATALOG_MAX_BYTES,
	BALANCE_WORKER_CATALOG_TTL_MS,
} from "@autumn/env/balanceWorkerConstants";
import { getCatalogRows } from "@autumn/postgres";
import { getPostgres } from "./getPostgres.js";

let catalogCache: CatalogCache | undefined;

/** The plan rows a record's subject references, cached the way the worker caches them. */
export function getCatalogCache(): CatalogCache {
	const postgres = getPostgres();
	catalogCache ??= createCatalogCache({
		ctx: {
			db: {
				getCatalogRows: ({ identity, ids }) =>
					getCatalogRows({
						ctx: { db: postgres.db, orgId: identity.orgId, env: identity.env },
						ids,
					}),
			},
			config: {
				mutableRowTtlMs: BALANCE_WORKER_CATALOG_TTL_MS,
				maxSizeBytes: BALANCE_WORKER_CATALOG_MAX_BYTES,
			},
		},
	});
	return catalogCache;
}
