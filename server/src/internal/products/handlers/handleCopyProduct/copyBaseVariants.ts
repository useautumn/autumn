import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	copyProduct,
	type PlanCopySource,
} from "@/internal/products/productUtils.js";
import { initVariantsInStripe } from "@/internal/products/stripeResourceUtils/initVariantsInStripe.js";
import { listExistingTargetPlanIds } from "./listExistingTargetPlanIds.js";

/**
 * Copies a base plan's variants into the target (org, env), relinking each to
 * the freshly copied base, and returns the copied variants' plan ids. A variant
 * whose id is already taken in the target is skipped so one stale plan can't
 * block promoting the base.
 */
export const copyBaseVariants = async ({
	source,
	toContext,
	variants,
	toBaseInternalId,
}: {
	source: PlanCopySource;
	toContext: AutumnContext;
	variants: FullProduct[];
	toBaseInternalId: string;
}): Promise<string[]> => {
	if (variants.length === 0) return [];

	const { db, logger, org: toOrg, env: toEnv } = toContext;
	const conflictingIds = await listExistingTargetPlanIds({
		toContext,
		planIds: variants.map((variant) => variant.id),
	});

	const copiedVariantIds: string[] = [];
	for (const variant of variants) {
		if (conflictingIds.has(variant.id)) {
			logger.warn(
				`copy plan: ${variant.id} already exists in ${toEnv}, skipping variant copy`,
			);
			continue;
		}

		await copyProduct({
			source,
			ctx: toContext,
			product: variant,
			toId: variant.id,
			toName: variant.name,
			baseInternalProductId: toBaseInternalId,
		});
		copiedVariantIds.push(variant.id);
	}

	if (copiedVariantIds.length === 0) return [];

	const copiedVariants = await ProductService.listFull({
		db,
		orgId: toOrg.id,
		env: toEnv,
		inIds: copiedVariantIds,
	});
	await initVariantsInStripe({ ctx: toContext, products: copiedVariants });

	return copiedVariantIds;
};
