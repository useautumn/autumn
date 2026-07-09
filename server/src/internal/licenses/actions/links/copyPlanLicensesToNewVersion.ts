import type { DrizzleCli } from "@/db/initDrizzle.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";

/** New plan versions carry the catalog license links (and their item refs)
 * forward from the previous version. */
export const copyPlanLicensesToNewVersion = async ({
	db,
	fromInternalProductId,
	toInternalProductId,
}: {
	db: DrizzleCli;
	fromInternalProductId: string;
	toInternalProductId: string;
}) => {
	const planLicenseRows =
		await planLicenseRepo.listCatalogByParentInternalProductIds({
			db,
			parentInternalProductIds: [fromInternalProductId],
		});

	for (const row of planLicenseRows) {
		const newLink = await planLicenseRepo.upsert({
			db,
			parentInternalProductId: toInternalProductId,
			licenseInternalProductId: row.license_internal_product_id,
			included: row.included,
			prepaidOnly: row.prepaid_only,
			metadata: row.metadata ?? {},
		});
		await licenseItemRepo.cloneItems({
			db,
			fromPlanLicenseId: row.id,
			toPlanLicenseId: newLink.id,
		});
	}
};
