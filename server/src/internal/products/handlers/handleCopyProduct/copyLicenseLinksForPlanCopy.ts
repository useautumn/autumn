import {
	type AppEnv,
	deduplicateArray,
	type FullProduct,
	type Organization,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { copyPlanLicenseLinks } from "@/internal/licenses/actions/links/copyPlanLicenseLinks.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";

/**
 * Recreates the copied base's and variants' license links in the target,
 * translating the base's plan id when the copy renamed it.
 */
export const copyLicenseLinksForPlanCopy = async ({
	ctx,
	fromBase,
	variants,
	toOrg,
	toEnv,
	toBaseId,
	copiedVariantIds,
}: {
	ctx: AutumnContext;
	fromBase: FullProduct;
	variants: FullProduct[];
	toOrg: Organization;
	toEnv: AppEnv;
	toBaseId: string;
	copiedVariantIds: string[];
}): Promise<void> => {
	const { db, logger } = ctx;

	const sourceLinks = await planLicenseRepo.listWithLicensePlanIdByParents({
		db,
		parentInternalProductIds: [
			fromBase.internal_id,
			...variants.map((variant) => variant.internal_id),
		],
	});
	if (sourceLinks.length === 0) return;

	const remapPlanId = (planId: string) =>
		planId === fromBase.id ? toBaseId : planId;
	const copiedPlanIds = new Set([toBaseId, ...copiedVariantIds]);
	const links = sourceLinks
		.map((link) => ({
			...link,
			parentPlanId: remapPlanId(link.parentPlanId),
			licensePlanId: remapPlanId(link.licensePlanId),
		}))
		.filter((link) => copiedPlanIds.has(link.parentPlanId));
	if (links.length === 0) return;

	const candidateLicensePlanIds = deduplicateArray(
		links.map((link) => link.licensePlanId),
	).filter((planId) => !copiedPlanIds.has(planId));
	const existingLicensePlans = await Promise.all(
		candidateLicensePlanIds.map((planId) =>
			ProductService.get({ db, id: planId, orgId: toOrg.id, env: toEnv }),
		),
	);
	const presentLicensePlanIds = existingLicensePlans
		.filter((product) => product !== undefined)
		.map((product) => product.id);

	// listFull throws on absent ids, and inIds bypasses the stale products cache.
	const toProducts = await ProductService.listFull({
		db,
		orgId: toOrg.id,
		env: toEnv,
		inIds: [...copiedPlanIds, ...presentLicensePlanIds],
	});

	await copyPlanLicenseLinks({ db, logger, links, toProducts });
};
