import { expect } from "bun:test";
import { customerProducts } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";

/** Features on the customer's license-pool product — only ids passed are checked. */
export const expectCustomerLicenseEntitlementsCorrect = async ({
	ctx,
	customerId,
	parentPlanId,
	featureIds,
	omitFeatureIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	parentPlanId: string;
	featureIds?: string[];
	omitFeatureIds?: string[];
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const parent = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product_id === parentPlanId,
	);
	const pool = parent?.customer_licenses?.[0];
	const licenseProduct = pool?.planLicense?.product;
	expect(licenseProduct, `no license pool on ${parentPlanId}`).toBeDefined();
	if (!licenseProduct) throw new Error(`no license pool on ${parentPlanId}`);
	for (const featureId of featureIds ?? []) {
		expect(
			licenseProduct.entitlements.some(
				(entitlement) => entitlement.feature_id === featureId,
			),
			`license missing ${featureId}`,
		).toBe(true);
	}
	for (const featureId of omitFeatureIds ?? []) {
		expect(
			licenseProduct.entitlements.some(
				(entitlement) => entitlement.feature_id === featureId,
			),
			`license still has ${featureId}`,
		).toBe(false);
	}
};

/** Child update_plan must not remint this seat as a standalone child attach. */
export const expectAssignmentCustomerProductNotChildMatched = async ({
	ctx,
	assignmentCustomerProductId,
	internalProductId,
}: {
	ctx: AutumnContext;
	assignmentCustomerProductId: string;
	internalProductId: string;
}) => {
	const [assignment] = await ctx.db
		.select({
			internalProductId: customerProducts.internal_product_id,
			customerLicenseLinkId: customerProducts.customer_license_link_id,
		})
		.from(customerProducts)
		.where(eq(customerProducts.id, assignmentCustomerProductId));
	expect(assignment).toBeDefined();
	expect(assignment?.internalProductId).toBe(internalProductId);
	expect(assignment?.customerLicenseLinkId).not.toBeNull();
};
