import type {
	AppEnv,
	Feature,
	FullProduct,
	Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { initVariantsInStripe } from "@/internal/products/stripeResourceUtils/initVariantsInStripe.js";
import {
	copyPlanIntoTarget,
	listExistingTargetPlanIds,
} from "./copyPlanIntoTarget.js";

/**
 * Lists the base plan's variants in the source (org, env). A variant may still
 * link to an older base version, so every version's internal id is queried.
 */
export const listSourceVariants = async ({
	db,
	base,
	fromOrg,
	fromEnv,
}: {
	db: DrizzleCli;
	base: FullProduct;
	fromOrg: Organization;
	fromEnv: AppEnv;
}): Promise<FullProduct[]> => {
	const baseVersions = await ProductService.listFull({
		db,
		orgId: fromOrg.id,
		env: fromEnv,
		inIds: [base.id],
		returnAll: true,
	});

	return ProductService.listVariantsByParent({
		db,
		baseInternalProductIds: baseVersions.map((version) => version.internal_id),
		orgId: fromOrg.id,
		env: fromEnv,
	});
};

/**
 * Copies a base plan's variants into the target (org, env), relinking each to
 * the freshly copied base, and returns the copied variants' plan ids. A variant
 * whose id is already taken in the target is skipped so one stale plan can't
 * block promoting the base.
 */
export const copyBaseVariants = async ({
	ctx,
	toContext,
	variants,
	fromEnv,
	toOrg,
	toEnv,
	toBaseInternalId,
	fromFeatures,
	toFeatures,
	crossOrg,
}: {
	ctx: AutumnContext;
	toContext: AutumnContext;
	variants: FullProduct[];
	fromEnv: AppEnv;
	toOrg: Organization;
	toEnv: AppEnv;
	toBaseInternalId: string;
	fromFeatures: Feature[];
	toFeatures: Feature[];
	crossOrg: boolean;
}): Promise<string[]> => {
	if (variants.length === 0) return [];

	const { db, logger } = ctx;
	const conflictingIds = await listExistingTargetPlanIds({
		db,
		planIds: variants.map((variant) => variant.id),
		toOrg,
		toEnv,
	});

	const copiedVariantIds: string[] = [];
	for (const variant of variants) {
		if (conflictingIds.has(variant.id)) {
			logger.warn(
				`copy plan: ${variant.id} already exists in ${toEnv}, skipping variant copy`,
			);
			continue;
		}

		await copyPlanIntoTarget({
			db,
			logger,
			plan: variant,
			fromEnv,
			toOrg,
			toEnv,
			fromFeatures,
			toFeatures,
			crossOrg,
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
