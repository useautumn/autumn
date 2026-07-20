import { licenseEntitlements, licensePrices } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Test-only catalog license hydrator. Ask an engineer before using it in server code. */
export const getFullLicenseProduct = async ({
	ctx,
	parentPlanId,
	parentVersion,
	licensePlanId,
	licenseVersion,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
	parentVersion?: number;
	licensePlanId: string;
	licenseVersion?: number;
}) => {
	const [parentProduct, baseLicenseProduct] = await Promise.all([
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parentPlanId,
			orgId: ctx.org.id,
			env: ctx.env,
			version: parentVersion,
		}),
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: licensePlanId,
			orgId: ctx.org.id,
			env: ctx.env,
			version: licenseVersion,
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

	const [items, entitlementRefs, priceRefs] = await Promise.all([
		licenseItemRepo.listByPlanLicenseIds({
			db: ctx.db,
			planLicenseIds: [planLicense.id],
		}),
		ctx.db.query.licenseEntitlements.findMany({
			where: eq(licenseEntitlements.plan_license_id, planLicense.id),
		}),
		ctx.db.query.licensePrices.findMany({
			where: eq(licensePrices.plan_license_id, planLicense.id),
		}),
	]);
	const [hydratedPlanLicense] = parentProduct.licenses ?? [];
	if (hydratedPlanLicense?.id !== planLicense.id) {
		throw new Error(
			`Parent ${parentPlanId} did not hydrate license ${licensePlanId}`,
		);
	}

	return {
		parentProduct,
		baseLicenseProduct,
		planLicense,
		fullLicenseProduct: hydratedPlanLicense.product,
		items,
		entitlementRefs,
		priceRefs,
	};
};
