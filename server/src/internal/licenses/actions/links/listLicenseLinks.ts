import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { serializePlanLicense } from "../../licenseResponseUtils.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { deriveCustomizeFromItems } from "../customize/deriveLicenseCustomize.js";

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

	const itemRowsByLinkId = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: rows.map(({ planLicense }) => planLicense.id),
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
				customize: deriveCustomizeFromItems({
					ctx,
					licenseProduct,
					itemRows: {
						entitlements: itemRowsByLinkId.entitlements.filter(
							(row) => row.plan_license_id === planLicense.id,
						),
						prices: itemRowsByLinkId.prices.filter(
							(row) => row.plan_license_id === planLicense.id,
						),
					},
				}),
			});
		}),
	);
};
