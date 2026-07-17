import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const getFullLicenseProduct = async ({
	ctx,
	parentPlanId,
	licensePlanId,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
	licensePlanId: string;
}) => {
	const [parentProduct, baseLicenseProduct] = await Promise.all([
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parentPlanId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: licensePlanId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	]);
	const planLicense = await planLicenseRepo.getCatalogByParentAndLicense({
		db: ctx.db,
		parentInternalProductId: parentProduct.internal_id,
		licenseInternalProductId: baseLicenseProduct.internal_id,
	});
	if (!planLicense) {
		throw new Error(
			`License ${licensePlanId} is not linked to parent ${parentPlanId}`,
		);
	}

	const items = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: [planLicense.id],
	});
	const [hydratedPlanLicense] = parentProduct.licenses ?? [];
	if (hydratedPlanLicense?.id !== planLicense.id) {
		throw new Error(
			`Parent ${parentPlanId} did not hydrate license ${licensePlanId}`,
		);
	}

	return {
		planLicense,
		fullLicenseProduct: hydratedPlanLicense.product,
		items,
	};
};
