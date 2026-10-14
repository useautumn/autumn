import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { queueBalanceWorkerEvicts } from "@/internal/balances/balanceWorker/queueBalanceWorkerEvicts.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { deleteMigrationDrafts } from "./deleteMigrationDrafts.js";

export const SANDBOX_ONLY_MESSAGE = "Only sandboxes can be reset";

export const resetSandbox = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<void> => {
	const { db, org, env, logger } = ctx;

	if (env !== AppEnv.Sandbox) {
		throw new RecaseError({
			message: SANDBOX_ONLY_MESSAGE,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	try {
		const deleted = await db.transaction(async (transaction) => {
			const tx = transaction as unknown as DrizzleCli;
			await deleteMigrationDrafts({ ctx: { ...ctx, db: tx } });

			const deleted = await CusService.safeDeleteByOrgId({
				db: tx,
				orgId: org.id,
				env: AppEnv.Sandbox,
			});
			await ProductService.safeDeleteByOrgId({
				db: tx,
				orgId: org.id,
				env: AppEnv.Sandbox,
			});
			await FeatureService.safeDeleteByOrgId({
				db: tx,
				orgId: org.id,
				env: AppEnv.Sandbox,
			});
			return deleted;
		});
		await queueBalanceWorkerEvicts({
			customers: deleted.map(({ id }) => ({
				orgId: org.id,
				env: AppEnv.Sandbox,
				customerId: id,
			})),
		});
	} finally {
		await invalidateProductsCache({ orgId: org.id, env: AppEnv.Sandbox });
		await clearOrgCache({ db, orgId: org.id, env: AppEnv.Sandbox, logger });
	}
};
