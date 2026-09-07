import { expect } from "bun:test";
import {
	customerLicenses,
	customerProducts,
	products as productsTable,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { and, eq } from "drizzle-orm";

type Ctx = Awaited<ReturnType<typeof initScenario>>["ctx"];

type ScheduledLicensePoolExpectation = {
	licensePlanId: string;
	granted: number;
	paidQuantity?: number;
};

const getScheduledLicensePools = async ({
	ctx,
	customerId,
	parentPlanId,
}: {
	ctx: Ctx;
	customerId: string;
	parentPlanId: string;
}) => {
	const licenseProducts = ctx.db
		.select({
			internalId: productsTable.internal_id,
			planId: productsTable.id,
		})
		.from(productsTable)
		.as("license_products");

	return await ctx.db
		.select({
			licensePlanId: licenseProducts.planId,
			granted: customerLicenses.granted,
			paidQuantity: customerLicenses.paid_quantity,
			parentStatus: customerProducts.status,
		})
		.from(customerLicenses)
		.innerJoin(
			customerProducts,
			eq(customerProducts.id, customerLicenses.parent_customer_product_id),
		)
		.innerJoin(
			licenseProducts,
			eq(
				licenseProducts.internalId,
				customerLicenses.license_internal_product_id,
			),
		)
		.where(
			and(
				eq(customerProducts.customer_id, customerId),
				eq(customerProducts.product_id, parentPlanId),
			),
		);
};

/**
 * Asserts the license pools hanging off a scheduled parent product. Scheduled
 * products are absent from the customer API until activation, so the pools are
 * read straight from the DB.
 */
export const expectScheduledLicensePools = async ({
	ctx,
	customerId,
	parentPlanId,
	licenses,
}: {
	ctx: Ctx;
	customerId: string;
	parentPlanId: string;
	licenses: ScheduledLicensePoolExpectation[];
}) => {
	const pools = await getScheduledLicensePools({
		ctx,
		customerId,
		parentPlanId,
	});

	expect(pools.length).toBe(licenses.length);

	for (const expectation of licenses) {
		const match = pools.find(
			(pool) => pool.licensePlanId === expectation.licensePlanId,
		);

		expect(
			match,
			`Missing scheduled license pool ${expectation.licensePlanId}: ${JSON.stringify(pools)}`,
		).toBeDefined();
		expect(match?.granted).toBe(expectation.granted);
		if (expectation.paidQuantity !== undefined) {
			expect(match?.paidQuantity).toBe(expectation.paidQuantity);
		}
	}
};
