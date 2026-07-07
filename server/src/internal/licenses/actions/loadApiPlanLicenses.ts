import type { ApiPlanLicenseV1, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { licenseItemRepo, planLicenseRepo } from "../repos/index.js";
import { deriveCustomizeFromItems } from "./licenseCustomize.js";

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

	// 1. Catalog links for the requested plans
	const links = await planLicenseRepo.listWithLicensePlanIdByParents({
		db: ctx.db,
		parentInternalProductIds: internalProductIds,
	});
	if (links.length === 0) return result;

	// 2. Customized content: content rows grouped per link
	const content = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: links.map(({ planLicense }) => planLicense.id),
	});
	const customizedLinkIds = new Set([
		...content.entitlements.map((row) => row.plan_license_id),
		...content.prices.map((row) => row.plan_license_id),
	]);

	// 3. License products, fetched once per distinct customized license
	const licenseProducts = new Map<string, FullProduct>();
	for (const { planLicense } of links) {
		const internalId = planLicense.license_internal_product_id;
		if (!customizedLinkIds.has(planLicense.id)) continue;
		if (licenseProducts.has(internalId)) continue;
		licenseProducts.set(
			internalId,
			await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: internalId,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		);
	}

	// 4. Assemble per parent, deriving customize for customized links
	for (const { planLicense, licensePlanId } of links) {
		const licenseProduct = licenseProducts.get(
			planLicense.license_internal_product_id,
		);
		const customize = licenseProduct
			? deriveCustomizeFromItems({
					ctx,
					licenseProduct,
					content: {
						entitlements: content.entitlements.filter(
							(row) => row.plan_license_id === planLicense.id,
						),
						prices: content.prices.filter(
							(row) => row.plan_license_id === planLicense.id,
						),
					},
				})
			: null;

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
