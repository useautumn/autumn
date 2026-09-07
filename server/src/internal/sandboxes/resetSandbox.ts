import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import { clearOrgWithFeaturesCache } from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
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
	const { db, org, env } = ctx;

	if (env !== AppEnv.Sandbox) {
		throw new RecaseError({
			message: SANDBOX_ONLY_MESSAGE,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// Drafts first: they reference the plans the product delete is about to take.
	await deleteMigrationDrafts({ ctx });

	// Then the three deletes in FK order — customers hold products, products hold
	// features; deleting a feature first would fail on the references to it.
	await CusService.safeDeleteByOrgId({
		db,
		orgId: org.id,
		env: AppEnv.Sandbox,
	});
	await ProductService.safeDeleteByOrgId({
		db,
		orgId: org.id,
		env: AppEnv.Sandbox,
	});
	await FeatureService.safeDeleteByOrgId({
		db,
		orgId: org.id,
		env: AppEnv.Sandbox,
	});

	await invalidateProductsCache({ orgId: org.id, env: AppEnv.Sandbox });
	// Workers read features through the org cache; without this they keep
	// seeing the deleted features for up to the TTL.
	await clearOrgWithFeaturesCache({ orgId: org.id, env: AppEnv.Sandbox });
};
