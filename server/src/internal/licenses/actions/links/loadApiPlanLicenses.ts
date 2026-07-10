import type { ApiPlanLicenseV1 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { deriveCustomizeByLinkId } from "../customize/deriveLicenseCustomize.js";

/**
 * Plan-response license data, fully derived: response handlers fetch through
 * here so getPlanResponse stays a pure DB→API mapping.
 */
export const loadApiPlanLicenses = async ({
	ctx,
	internalProductIds,
}: {
	ctx: AutumnContext;
	internalProductIds: string[];
}): Promise<Map<string, ApiPlanLicenseV1[]>> => {
	const result = new Map<string, ApiPlanLicenseV1[]>();
	if (internalProductIds.length === 0) return result;

	const links = await planLicenseRepo.listWithLicensePlanIdByParents({
		db: ctx.db,
		parentInternalProductIds: internalProductIds,
	});
	if (links.length === 0) return result;

	const itemRows = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: links.map(({ planLicense }) => planLicense.id),
	});
	const customizeByLinkId = await deriveCustomizeByLinkId({
		ctx,
		links,
		itemRows,
	});

	for (const { planLicense, licensePlanId } of links) {
		const customize = customizeByLinkId.get(planLicense.id) ?? null;
		const existing = result.get(planLicense.parent_internal_product_id) ?? [];
		existing.push({
			license_plan_id: licensePlanId,
			included: planLicense.included,
			prepaid_only: planLicense.prepaid_only,
			...(customize ? { customize } : {}),
		});
		result.set(planLicense.parent_internal_product_id, existing);
	}
	return result;
};
