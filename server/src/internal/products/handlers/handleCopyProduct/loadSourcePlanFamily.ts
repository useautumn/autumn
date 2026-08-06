import {
	type AppEnv,
	deduplicateArray,
	type FullProduct,
	type Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	type PlanLicenseWithPlanIds,
	planLicenseRepo,
} from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** A variant may still link to an older base version, so every version's
 * internal id is queried. */
const listSourceVariants = async ({
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
 * Loads everything a single-plan copy must carry along: the base's variants,
 * the family's license links, and the license plans those links point at.
 */
export const loadSourcePlanFamily = async ({
	db,
	base,
	fromOrg,
	fromEnv,
}: {
	db: DrizzleCli;
	base: FullProduct;
	fromOrg: Organization;
	fromEnv: AppEnv;
}): Promise<{
	variants: FullProduct[];
	sourceLicenseLinks: PlanLicenseWithPlanIds[];
	sourceLicensePlans: FullProduct[];
}> => {
	const variants = await listSourceVariants({ db, base, fromOrg, fromEnv });

	const sourceLicenseLinks =
		await planLicenseRepo.listWithLicensePlanIdByParents({
			db,
			parentInternalProductIds: [
				base.internal_id,
				...variants.map((variant) => variant.internal_id),
			],
		});

	const familyPlanIds = new Set([
		base.id,
		...variants.map((variant) => variant.id),
	]);
	const licensePlanIds = deduplicateArray(
		sourceLicenseLinks.map((link) => link.licensePlanId),
	).filter((planId) => !familyPlanIds.has(planId));
	const sourceLicensePlans =
		licensePlanIds.length > 0
			? await ProductService.listFull({
					db,
					orgId: fromOrg.id,
					env: fromEnv,
					inIds: licensePlanIds,
				})
			: [];

	return { variants, sourceLicenseLinks, sourceLicensePlans };
};
