import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** A variant's `base_internal_product_id` → the stable public plan id the UI keys on. */
export const resolveBasePlanId = async ({
	db,
	orgId,
	env,
	baseInternalProductId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	baseInternalProductId: string | null;
}): Promise<string | null> => {
	if (!baseInternalProductId) return null;

	const allVersions = await ProductService.listCachedAllVersions({
		db,
		orgId,
		env,
	});
	return (
		allVersions.find((version) => version.internal_id === baseInternalProductId)
			?.id ?? null
	);
};
