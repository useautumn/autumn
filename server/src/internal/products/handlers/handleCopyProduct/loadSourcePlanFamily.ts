import { deduplicateArray, type FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type PlanLicenseWithPlanIds,
	planLicenseRepo,
} from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import type { PlanCopySource } from "@/internal/products/productUtils.js";

const listSourceVariants = async ({
	ctx,
	source,
	base,
}: {
	ctx: AutumnContext;
	source: PlanCopySource;
	base: FullProduct;
}): Promise<FullProduct[]> => {
	const { db } = ctx;
	const baseVersions = await ProductService.listFull({
		db,
		orgId: source.org.id,
		env: source.env,
		inIds: [base.id],
		returnAll: true,
	});

	return ProductService.listVariantsByParent({
		db,
		baseInternalProductIds: baseVersions.map((version) => version.internal_id),
		orgId: source.org.id,
		env: source.env,
	});
};

export const loadSourcePlanFamily = async ({
	ctx,
	source,
	base,
}: {
	ctx: AutumnContext;
	source: PlanCopySource;
	base: FullProduct;
}): Promise<{
	variants: FullProduct[];
	sourceLicenseLinks: PlanLicenseWithPlanIds[];
	sourceLicensePlans: FullProduct[];
}> => {
	const { db } = ctx;
	const variants = await listSourceVariants({ ctx, source, base });

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
					orgId: source.org.id,
					env: source.env,
					inIds: licensePlanIds,
				})
			: [];

	return { variants, sourceLicenseLinks, sourceLicensePlans };
};
