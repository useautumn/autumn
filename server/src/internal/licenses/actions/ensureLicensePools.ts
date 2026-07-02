import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { isLicensePoolParentStatus } from "../licenseUtils.js";
import {
	customerProductLicenseRepo,
	licensePoolRepo,
	planLicenseRepo,
} from "../repos/index.js";

export const ensurePoolsForCustomerProducts = async ({
	ctx,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
}) => {
	if (customerProducts.length === 0) return;

	const activeCustomerProducts = customerProducts.filter((customerProduct) =>
		isLicensePoolParentStatus({ status: customerProduct.status }),
	);
	if (activeCustomerProducts.length === 0) return;

	const inheritedCustomerProducts = activeCustomerProducts.filter(
		(cp) => !cp.license_set_customized,
	);
	const customCustomerProducts = activeCustomerProducts.filter(
		(customerProduct) => customerProduct.license_set_customized,
	);
	const productIds = [
		...new Set(
			inheritedCustomerProducts.map(
				(customerProduct) => customerProduct.internal_product_id,
			),
		),
	];
	const linkedPlanLicenses =
		productIds.length > 0
			? await planLicenseRepo.listByParentInternalProductIds({
					db: ctx.db,
					parentInternalProductIds: productIds,
				})
			: [];
	const customParentIds = customCustomerProducts.map(
		(customerProduct) => customerProduct.id,
	);
	const linkedCustomLicenses =
		customParentIds.length > 0
			? await customerProductLicenseRepo.listByParentCustomerProductIds({
					db: ctx.db,
					parentCustomerProductIds: customParentIds,
				})
			: [];
	if (linkedPlanLicenses.length === 0 && linkedCustomLicenses.length === 0)
		return;

	const planLicensesByParentProductId = new Map<
		string,
		typeof linkedPlanLicenses
	>();
	for (const planLicense of linkedPlanLicenses) {
		const existing =
			planLicensesByParentProductId.get(
				planLicense.parent_internal_product_id,
			) ?? [];
		existing.push(planLicense);
		planLicensesByParentProductId.set(
			planLicense.parent_internal_product_id,
			existing,
		);
	}

	const customLicensesByParentProductId = new Map<
		string,
		typeof linkedCustomLicenses
	>();
	for (const customLicense of linkedCustomLicenses) {
		const existing =
			customLicensesByParentProductId.get(
				customLicense.parent_customer_product_id,
			) ?? [];
		existing.push(customLicense);
		customLicensesByParentProductId.set(
			customLicense.parent_customer_product_id,
			existing,
		);
	}

	const rows = inheritedCustomerProducts.flatMap((parentCustomerProduct) =>
		(
			planLicensesByParentProductId.get(
				parentCustomerProduct.internal_product_id,
			) ?? []
		).map((planLicense) => ({
			id: generateId("lic_pool"),
			org_id: ctx.org.id,
			env: ctx.env,
			internal_customer_id: parentCustomerProduct.internal_customer_id,
			parent_customer_product_id: parentCustomerProduct.id,
			plan_license_id: planLicense.id,
			customer_product_license_id: null,
			license_internal_product_id: planLicense.license_internal_product_id,
			license_customer_product_id: null,
			created_at: Date.now(),
			updated_at: Date.now(),
		})),
	);
	const customRows = customCustomerProducts.flatMap((parentCustomerProduct) =>
		(customLicensesByParentProductId.get(parentCustomerProduct.id) ?? []).map(
			(customLicense) => ({
				id: generateId("lic_pool"),
				org_id: ctx.org.id,
				env: ctx.env,
				internal_customer_id: parentCustomerProduct.internal_customer_id,
				parent_customer_product_id: parentCustomerProduct.id,
				plan_license_id: null,
				customer_product_license_id: customLicense.id,
				license_internal_product_id: customLicense.license_internal_product_id,
				license_customer_product_id: null,
				created_at: Date.now(),
				updated_at: Date.now(),
			}),
		),
	);

	if (rows.length === 0 && customRows.length === 0) return;

	if (rows.length > 0) {
		await licensePoolRepo.insertInheritedPools({ db: ctx.db, rows });
	}

	if (customRows.length > 0) {
		await licensePoolRepo.insertCustomPools({ db: ctx.db, rows: customRows });
	}
};
