import type { DbPlanLicense, FullProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

/**
 * Recreates plan_license links in a copy target by translating both ends
 * through external plan ids. Links whose parent or license is absent from the
 * target are skipped silently; validation-rejected links are skipped with a
 * warning.
 */
export const copyPlanLicenseLinks = async ({
	db,
	logger,
	links,
	fromProducts,
	toProducts,
}: {
	db: DrizzleCli;
	logger: Logger;
	links: { planLicense: DbPlanLicense; licensePlanId: string }[];
	fromProducts: FullProduct[];
	toProducts: FullProduct[];
}) => {
	if (links.length === 0) return;

	const fromPlanIdByInternalId = new Map(
		fromProducts.map((product) => [product.internal_id, product.id]),
	);
	const latestToProductByPlanId = new Map<string, FullProduct>();
	for (const product of toProducts) {
		const existing = latestToProductByPlanId.get(product.id);
		if (!existing || product.version > existing.version) {
			latestToProductByPlanId.set(product.id, product);
		}
	}

	for (const { planLicense, licensePlanId } of links) {
		const parentPlanId = fromPlanIdByInternalId.get(
			planLicense.parent_internal_product_id,
		);
		const toParent = parentPlanId
			? latestToProductByPlanId.get(parentPlanId)
			: undefined;
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
				`copy env: skipping license link ${toParent.id} -> ${licensePlanId}: ${error instanceof Error ? error.message : error}`,
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
