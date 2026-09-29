import type { AppEnv } from "@autumn/shared";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { publishCatalogInvalidation } from "@/internal/balanceWorker/catalog/publishCatalogInvalidation.js";

/** Every copy of an org's catalog: the server's products cache, and the rows the balance worker and herald hold. */
export const invalidateOrgCatalog = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: Pick<AutumnContext, "logger">;
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	// The publish reports its own failure and never holds the response; the caches bound staleness with a TTL.
	void publishCatalogInvalidation({ ctx, orgId, env });
	await invalidateProductsCache({ orgId, env });
};
