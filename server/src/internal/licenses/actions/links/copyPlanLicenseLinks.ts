import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getLatestProducts } from "@/internal/products/productUtils.js";
import {
	type PlanLicenseWithPlanIds,
	planLicenseRepo,
} from "../../repos/planLicenseRepo.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

/**
 * Recreates plan_license links in a copy target, translated through external
 * plan ids. Absent-end links are skipped; validation failures warn and skip.
 */
export const copyPlanLicenseLinks = async ({
	ctx,
	links,
	toProducts,
}: {
	ctx: AutumnContext;
	links: PlanLicenseWithPlanIds[];
	toProducts: FullProduct[];
}) => {
	const { db, logger } = ctx;
	if (links.length === 0) return;

	const latestToProductByPlanId = new Map(
		getLatestProducts(toProducts).map((product) => [product.id, product]),
	);

	for (const { planLicense, licensePlanId, parentPlanId } of links) {
		const toParent = latestToProductByPlanId.get(parentPlanId);
		const toLicense = latestToProductByPlanId.get(licensePlanId);
		if (!toParent || !toLicense) continue;

		try {
			validateLicenseLink({
				parentProduct: toParent,
				licenseProduct: toLicense,
				prepaidOnly: planLicense.prepaid_only,
				licensePlanId,
			});
		} catch (error) {
			logger.warn(
				`copy env: skipping license link ${parentPlanId} -> ${licensePlanId}: ${error instanceof Error ? error.message : error}`,
			);
			continue;
		}

		await planLicenseRepo.upsert({
			db,
			parentInternalProductId: toParent.internal_id,
			licenseInternalProductId: toLicense.internal_id,
			included: planLicense.included,
			prepaidOnly: planLicense.prepaid_only,
			metadata: planLicense.metadata ?? {},
		});
	}
};
