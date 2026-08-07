import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { copyPlanLicenseLinks } from "@/internal/licenses/actions/links/copyPlanLicenseLinks.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";

/**
 * Recreates the copy set's plan license links in the target env, resolving
 * each end against the copied plans or licenses the target already had.
 */
export const copyEnvLicenseLinks = async ({
	toContext,
	fromProducts,
	toProducts,
	copiedToProducts,
}: {
	toContext: AutumnContext;
	fromProducts: FullProduct[];
	toProducts: FullProduct[];
	copiedToProducts: FullProduct[];
}): Promise<void> => {
	const links = await planLicenseRepo.listWithLicensePlanIdByParents({
		db: toContext.db,
		parentInternalProductIds: fromProducts.map(
			(product) => product.internal_id,
		),
	});
	if (links.length === 0) return;

	const copiedIds = new Set(copiedToProducts.map((product) => product.id));
	const existingTargetLicenses = toProducts.filter(
		(product) =>
			!copiedIds.has(product.id) &&
			links.some((link) => link.licensePlanId === product.id),
	);

	await copyPlanLicenseLinks({
		ctx: toContext,
		links,
		toProducts: [...copiedToProducts, ...existingTargetLicenses],
	});
};
