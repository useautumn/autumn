import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { serializePlanLicense } from "../../licenseResponseUtils.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { deriveCustomizeByLinkId } from "../customize/deriveLicenseCustomize.js";

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

	const itemRows = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: rows.map(({ planLicense }) => planLicense.id),
	});
	const customizeByLinkId = await deriveCustomizeByLinkId({
		ctx,
		links: rows,
		itemRows,
	});

	return rows.map(({ planLicense, licensePlanId }) =>
		serializePlanLicense({
			planLicense,
			parentPlanId: parentProduct.id,
			licensePlanId,
			customize: customizeByLinkId.get(planLicense.id) ?? null,
		}),
	);
};
