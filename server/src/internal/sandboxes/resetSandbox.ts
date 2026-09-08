import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { deleteMigrationDrafts } from "./deleteMigrationDrafts.js";

export const SANDBOX_ONLY_MESSAGE = "Only sandboxes can be reset";

/**
 * Empties the sandbox the caller's key belongs to: its migration drafts,
 * customers, plans and features. Keys, settings and Stripe are left alone.
 */
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
		// One transaction: a failure part-way must not leave the sandbox holding
		// customers whose plans are gone, with no way to retry back to the start.
		await db.transaction(async (transaction) => {
			const tx = transaction as unknown as DrizzleCli;
			// Drafts first: they reference the plans the product delete is about to take.
			await deleteMigrationDrafts({ ctx: { ...ctx, db: tx } });

			// Then the three deletes in FK order — customers hold products, products hold
			// features; deleting a feature first would fail on the references to it.
			await CusService.safeDeleteByOrgId({
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
		});
	} finally {
		// Even a rolled-back reset may have read rows into these caches, so they
		// are dropped on both paths rather than left serving a stale catalog.
		await invalidateProductsCache({ orgId: org.id, env: AppEnv.Sandbox });
		// Every secret key caches the org's features beside it, so a wiped sandbox
		// would keep answering with the old catalog until that cache expires.
		await clearOrgCache({ db, orgId: org.id, env: AppEnv.Sandbox, logger });
	}
};
