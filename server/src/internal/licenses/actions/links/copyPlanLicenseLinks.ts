import type { FullProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";

/**
 * Recreates plan_license links in a copy target by translating both ends
 * through external product ids. Links whose parent or license was not copied
 * are skipped.
 */
export const copyPlanLicenseLinks = async ({
	db,
	fromProducts,
	toProducts,
}: {
	db: DrizzleCli;
	fromProducts: FullProduct[];
	toProducts: FullProduct[];
}) => {
	const links = await planLicenseRepo.listCatalogByParentInternalProductIds({
		db,
		parentInternalProductIds: fromProducts.map(
			(product) => product.internal_id,
		),
	});
	if (links.length === 0) return;

	const fromExternalIdByInternalId = new Map(
		fromProducts.map((product) => [product.internal_id, product.id]),
	);
	const latestToProductByExternalId = new Map<string, FullProduct>();
	for (const product of toProducts) {
		const existing = latestToProductByExternalId.get(product.id);
		if (!existing || product.version > existing.version) {
			latestToProductByExternalId.set(product.id, product);
		}
	}

	for (const link of links) {
		const parentExternalId = fromExternalIdByInternalId.get(
			link.parent_internal_product_id,
		);
		const licenseExternalId = fromExternalIdByInternalId.get(
			link.license_internal_product_id,
		);
		const toParent = parentExternalId
			? latestToProductByExternalId.get(parentExternalId)
			: undefined;
		const toLicense = licenseExternalId
			? latestToProductByExternalId.get(licenseExternalId)
			: undefined;
		if (!toParent || !toLicense) continue;

		await planLicenseRepo.upsert({
			db,
			parentInternalProductId: toParent.internal_id,
			licenseInternalProductId: toLicense.internal_id,
			included: link.included,
			prepaidOnly: link.prepaid_only,
			metadata: link.metadata ?? {},
		});
	}
};
