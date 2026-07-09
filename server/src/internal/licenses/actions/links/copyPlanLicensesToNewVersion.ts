import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { resolveEffectiveLicenseProduct } from "../customize/resolveEffectiveLicenseProduct.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

/** New plan versions carry the catalog license links (and their item refs)
 * forward from the previous version. Every copied link must still satisfy the
 * link rules against the new version, or the versioning is rejected. */
export const copyPlanLicensesToNewVersion = async ({
	ctx,
	fromInternalProductId,
	toInternalProductId,
}: {
	ctx: AutumnContext;
	fromInternalProductId: string;
	toInternalProductId: string;
}) => {
	const planLicenseRows =
		await planLicenseRepo.listCatalogByParentInternalProductIds({
			db: ctx.db,
			parentInternalProductIds: [fromInternalProductId],
		});
	if (planLicenseRows.length === 0) return;

	const newParentProduct = await getFullLicenseProduct({
		ctx,
		idOrInternalId: toInternalProductId,
	});
	for (const row of planLicenseRows) {
		const licenseProduct = await getFullLicenseProduct({
			ctx,
			idOrInternalId: row.license_internal_product_id,
		});
		validateLicenseLink({
			parentProduct: newParentProduct,
			licenseProduct: await resolveEffectiveLicenseProduct({
				ctx,
				licenseProduct,
				planLicenseId: row.id,
			}),
			prepaidOnly: row.prepaid_only,
			licensePlanId: licenseProduct.id,
		});

		const newLink = await planLicenseRepo.upsert({
			db: ctx.db,
			parentInternalProductId: toInternalProductId,
			licenseInternalProductId: row.license_internal_product_id,
			included: row.included,
			prepaidOnly: row.prepaid_only,
			metadata: row.metadata ?? {},
		});
		await licenseItemRepo.cloneItems({
			db: ctx.db,
			fromPlanLicenseId: row.id,
			toPlanLicenseId: newLink.id,
		});
	}
};
