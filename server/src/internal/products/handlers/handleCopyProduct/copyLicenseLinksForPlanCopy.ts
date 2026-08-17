import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { copyPlanLicenseLinks } from "@/internal/licenses/actions/links/copyPlanLicenseLinks.js";
import type { PlanLicenseWithPlanIds } from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	copyProduct,
	initProductInStripe,
	type PlanCopySource,
} from "@/internal/products/productUtils.js";
import { listExistingTargetPlanIds } from "./listExistingTargetPlanIds.js";

/**
 * Recreates the copied base's and variants' license links in the target,
 * copying over license plans the target lacks and translating the base's plan
 * id when the copy renamed it.
 */
export const copyLicenseLinksForPlanCopy = async ({
	source,
	toContext,
	fromBaseId,
	sourceLinks,
	sourceLicensePlans,
	toBaseId,
	copiedVariantIds,
}: {
	source: PlanCopySource;
	toContext: AutumnContext;
	fromBaseId: string;
	sourceLinks: PlanLicenseWithPlanIds[];
	sourceLicensePlans: FullProduct[];
	toBaseId: string;
	copiedVariantIds: string[];
}): Promise<void> => {
	const { db, org: toOrg, env: toEnv } = toContext;
	if (sourceLinks.length === 0) return;

	const remapPlanId = (planId: string) =>
		planId === fromBaseId ? toBaseId : planId;
	const copiedPlanIds = new Set([toBaseId, ...copiedVariantIds]);
	const links = sourceLinks
		.map((link) => ({
			...link,
			parentPlanId: remapPlanId(link.parentPlanId),
			licensePlanId: remapPlanId(link.licensePlanId),
		}))
		.filter((link) => copiedPlanIds.has(link.parentPlanId));
	if (links.length === 0) return;

	const candidateLicensePlanIds = new Set(
		links
			.map((link) => link.licensePlanId)
			.filter((planId) => !copiedPlanIds.has(planId)),
	);
	const presentIds = await listExistingTargetPlanIds({
		toContext,
		planIds: [...candidateLicensePlanIds],
	});

	const licensePlansToCopy = sourceLicensePlans.filter(
		(licensePlan) =>
			candidateLicensePlanIds.has(licensePlan.id) &&
			!presentIds.has(licensePlan.id),
	);
	for (const licensePlan of licensePlansToCopy) {
		await copyProduct({
			source,
			ctx: toContext,
			product: licensePlan,
			toId: licensePlan.id,
			toName: licensePlan.name,
		});
	}

	const copiedLicensePlanIds = new Set(
		licensePlansToCopy.map((licensePlan) => licensePlan.id),
	);
	// inIds bypasses the stale products cache; requested ids must exist.
	const toProducts = await ProductService.listFull({
		db,
		orgId: toOrg.id,
		env: toEnv,
		inIds: [...copiedPlanIds, ...presentIds, ...copiedLicensePlanIds],
	});

	for (const product of toProducts) {
		if (!copiedLicensePlanIds.has(product.id)) continue;
		await initProductInStripe({ ctx: toContext, product });
	}

	await copyPlanLicenseLinks({ ctx: toContext, links, toProducts });
};
