import type { AppEnv, Feature, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { copyProduct } from "@/internal/products/productUtils.js";

/** Plan ids from the given set that already exist in the target (org, env). */
export const listExistingTargetPlanIds = async ({
	toContext,
	planIds,
}: {
	toContext: AutumnContext;
	planIds: string[];
}): Promise<Set<string>> => {
	const { db, org, env } = toContext;
	const existing = await ProductService.listByIds({
		db,
		orgId: org.id,
		env,
		ids: planIds,
	});
	return new Set(existing.map((product) => product.id));
};

/**
 * Copies a family plan into the target under its own id, never as a default,
 * dropping the base variant pointer on cross-org copies.
 */
export const copyPlanIntoTarget = async ({
	toContext,
	plan,
	fromEnv,
	fromFeatures,
	crossOrg,
	baseInternalProductId,
}: {
	toContext: AutumnContext;
	plan: FullProduct;
	fromEnv: AppEnv;
	fromFeatures: Feature[];
	crossOrg: boolean;
	baseInternalProductId?: string | null;
}): Promise<string> =>
	copyProduct({
		ctx: toContext,
		product: {
			...plan,
			is_default: false,
			base_variant_id: crossOrg ? null : plan.base_variant_id,
		},
		toId: plan.id,
		toName: plan.name,
		fromEnv,
		fromFeatures,
		baseInternalProductId,
	});
