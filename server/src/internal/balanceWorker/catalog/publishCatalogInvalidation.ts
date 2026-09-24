import type { AppEnv } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Best effort: the client bounds the publish, the caches bound staleness with a TTL, so a failure is logged, never a failed request. */
export const publishCatalogInvalidation = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: Pick<AutumnContext, "logger">;
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	try {
		await getBalanceWorkerClient().catalog.invalidateOrgCatalog({ orgId, env });
	} catch (error) {
		ctx.logger.error(
			{
				error,
				type: "catalog_invalidation_publish_failed",
				data: { orgId, env },
			},
			"Could not publish a catalog invalidation to the balance worker",
		);
	}
};
