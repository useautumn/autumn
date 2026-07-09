import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { serializePlanLicense } from "../../licenseResponseUtils.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { deriveLicenseCustomize } from "../customize/deriveLicenseCustomize.js";

export const listLicenseLinks = async ({
	ctx,
	parentPlanId,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
}) => {
	const parentProduct = await getFullLicenseProduct({
		ctx,
		idOrInternalId: parentPlanId,
	});

	const rows = await planLicenseRepo.listWithLicensePlanIdByParents({
		db: ctx.db,
		parentInternalProductIds: [parentProduct.internal_id],
	});

	return await Promise.all(
		rows.map(async ({ planLicense, licensePlanId }) => {
			const licenseProduct = await getFullLicenseProduct({
				ctx,
				idOrInternalId: planLicense.license_internal_product_id,
			});
			return serializePlanLicense({
				planLicense,
				parentPlanId: parentProduct.id,
				licensePlanId,
				customize: await deriveLicenseCustomize({
					ctx,
					licenseProduct,
					planLicenseId: planLicense.id,
				}),
			});
		}),
	);
};
