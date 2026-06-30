import {
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

	const activeCustomerProducts = customerProducts.filter((cp) =>
		isLicensePoolParentStatus({ status: cp.status }),
	);
	if (activeCustomerProducts.length === 0) return;

	const productIds = [
		...new Set(activeCustomerProducts.map((cp) => cp.internal_product_id)),
	];
	const linkedPlanLicenses = await ctx.db.query.planLicenses.findMany({
		where: inArray(planLicenses.parent_internal_product_id, productIds),
	});
	if (linkedPlanLicenses.length === 0) return;

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

	const rows = activeCustomerProducts.flatMap((parentCusProduct) =>
		(
			planLicensesByParentProductId.get(parentCusProduct.internal_product_id) ??
			[]
		).map((planLicense) => ({
			id: generateId("lic_pool"),
			org_id: ctx.org.id,
			env: ctx.env,
			internal_customer_id: parentCusProduct.internal_customer_id,
			parent_customer_product_id: parentCusProduct.id,
			plan_license_id: planLicense.id,
			license_internal_product_id: planLicense.license_internal_product_id,
			license_customer_product_id: null,
			created_at: Date.now(),
			updated_at: Date.now(),
		})),
	);

	if (rows.length === 0) return;

	await ctx.db
		.insert(licensePools)
		.values(rows)
		.onConflictDoNothing({
			target: [
				licensePools.parent_customer_product_id,
				licensePools.plan_license_id,
			],
		});
};
