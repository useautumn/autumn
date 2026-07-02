import {
	customerProductLicenses,
	type FullCusProduct,
	licensePools,
	planLicenses,
} from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { isLicensePoolParentStatus } from "../licenseUtils.js";

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
			? await ctx.db.query.planLicenses.findMany({
					where: inArray(planLicenses.parent_internal_product_id, productIds),
				})
			: [];
	const customParentIds = customCustomerProducts.map(
		(customerProduct) => customerProduct.id,
	);
	const linkedCustomLicenses =
		customParentIds.length > 0
			? await ctx.db.query.customerProductLicenses.findMany({
					where: inArray(
						customerProductLicenses.parent_customer_product_id,
						customParentIds,
					),
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
		await ctx.db
			.insert(licensePools)
			.values(rows)
			.onConflictDoNothing({
				target: [
					licensePools.parent_customer_product_id,
					licensePools.plan_license_id,
				],
			});
	}

	if (customRows.length > 0) {
		await ctx.db
			.insert(licensePools)
			.values(customRows)
			.onConflictDoNothing({
				target: [
					licensePools.parent_customer_product_id,
					licensePools.customer_product_license_id,
				],
			});
	}
};
