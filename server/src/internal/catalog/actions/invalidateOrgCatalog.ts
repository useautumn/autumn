import type { AppEnv } from "@autumn/shared";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { publishCatalogInvalidation } from "@/internal/balanceWorker/catalog/publishCatalogInvalidation.js";

export const invalidateOrgCatalog = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: Pick<AutumnContext, "logger">;
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	void publishCatalogInvalidation({ ctx, orgId, env });
	await invalidateProductsCache({ orgId, env });
};
