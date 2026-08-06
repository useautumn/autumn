import {
	type AppEnv,
	type DbPlanLicense,
	deduplicateArray,
	type Feature,
	type FullProduct,
	type Organization,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { copyPlanLicenseLinks } from "@/internal/licenses/actions/links/copyPlanLicenseLinks.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	copyProduct,
	initProductInStripe,
} from "@/internal/products/productUtils.js";

/**
 * Recreates the copied base's and variants' license links in the target,
 * copying over license plans the target lacks and translating the base's plan
 * id when the copy renamed it.
 */
export const copyLicenseLinksForPlanCopy = async ({
	ctx,
	toContext,
	fromBase,
	sourceLinks,
	sourceLicensePlans,
	fromEnv,
	toOrg,
	toEnv,
	toBaseId,
	copiedVariantIds,
	fromFeatures,
	toFeatures,
	crossOrg,
}: {
	ctx: AutumnContext;
	toContext: AutumnContext;
	fromBase: FullProduct;
	sourceLinks: {
		planLicense: DbPlanLicense;
		licensePlanId: string;
		parentPlanId: string;
	}[];
	sourceLicensePlans: FullProduct[];
	fromEnv: AppEnv;
	toOrg: Organization;
	toEnv: AppEnv;
	toBaseId: string;
	copiedVariantIds: string[];
	fromFeatures: Feature[];
	toFeatures: Feature[];
	crossOrg: boolean;
}): Promise<void> => {
	const { db, logger } = ctx;
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
	const presentIds = new Set(presentLicensePlanIds);

	const licensePlansToCopy = sourceLicensePlans.filter(
		(licensePlan) =>
			candidateLicensePlanIds.includes(licensePlan.id) &&
			!presentIds.has(licensePlan.id),
	);
	for (const licensePlan of licensePlansToCopy) {
		await copyProduct({
			db,
			product: {
				...licensePlan,
				is_default: false,
				base_variant_id: crossOrg ? null : licensePlan.base_variant_id,
			},
			toOrgId: toOrg.id,
			toId: licensePlan.id,
			toName: licensePlan.name,
			fromEnv,
			toEnv,
			toFeatures,
			fromFeatures,
			org: toOrg,
			logger,
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
		inIds: [
			...copiedPlanIds,
			...presentLicensePlanIds,
			...copiedLicensePlanIds,
		],
	});

	for (const product of toProducts) {
		if (!copiedLicensePlanIds.includes(product.id)) continue;
		await initProductInStripe({ ctx: toContext, product });
	}

	await copyPlanLicenseLinks({ db, logger, links, toProducts });
};
