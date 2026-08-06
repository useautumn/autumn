import {
	type AppEnv,
	deduplicateArray,
	type Feature,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { copyPlanLicenseLinks } from "@/internal/licenses/actions/links/copyPlanLicenseLinks.js";
import type { PlanLicenseWithPlanIds } from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import {
	copyPlanIntoTarget,
	listExistingTargetPlanIds,
} from "./copyPlanIntoTarget.js";

/**
 * Recreates the copied base's and variants' license links in the target,
 * copying over license plans the target lacks and translating the base's plan
 * id when the copy renamed it.
 */
export const copyLicenseLinksForPlanCopy = async ({
	toContext,
	fromBase,
	sourceLinks,
	sourceLicensePlans,
	fromEnv,
	fromFeatures,
	toBaseId,
	copiedVariantIds,
	crossOrg,
}: {
	toContext: AutumnContext;
	fromBase: FullProduct;
	sourceLinks: PlanLicenseWithPlanIds[];
	sourceLicensePlans: FullProduct[];
	fromEnv: AppEnv;
	fromFeatures: Feature[];
	toBaseId: string;
	copiedVariantIds: string[];
	crossOrg: boolean;
}): Promise<void> => {
	const { db, org: toOrg, env: toEnv } = toContext;
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
	const presentIds = await listExistingTargetPlanIds({
		toContext,
		planIds: candidateLicensePlanIds,
	});

	const licensePlansToCopy = sourceLicensePlans.filter(
		(licensePlan) =>
			candidateLicensePlanIds.includes(licensePlan.id) &&
			!presentIds.has(licensePlan.id),
	);
	for (const licensePlan of licensePlansToCopy) {
		await copyPlanIntoTarget({
			toContext,
			plan: licensePlan,
			fromEnv,
			fromFeatures,
			crossOrg,
		});
	}

	const copiedLicensePlanIds = licensePlansToCopy.map(
		(licensePlan) => licensePlan.id,
	);
	// listFull throws on absent ids, and inIds bypasses the stale products cache.
	const toProducts = await ProductService.listFull({
		db,
		orgId: toOrg.id,
		env: toEnv,
		inIds: [...copiedPlanIds, ...presentIds, ...copiedLicensePlanIds],
	});

	for (const product of toProducts) {
		if (!copiedLicensePlanIds.includes(product.id)) continue;
		await initProductInStripe({ ctx: toContext, product });
	}

	await copyPlanLicenseLinks({ ctx: toContext, links, toProducts });
};
