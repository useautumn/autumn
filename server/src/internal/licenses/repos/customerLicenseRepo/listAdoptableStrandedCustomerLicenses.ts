import {
	CusProductStatus,
	customerLicenses,
	customerProducts,
	type DbCustomerLicense,
	products,
} from "@autumn/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { PHASE_BOUNDARY_TOLERANCE_MS } from "@/internal/billing/v2/utils/initFullCustomerProduct/findTransitionSourceCustomerProduct.js";

export type StrandedCustomerLicense = {
	customerLicense: DbCustomerLicense;
	parentEndedAt: number;
	parentGroup: string | null;
	licensePlanId: string;
};

export const listAdoptableStrandedCustomerLicenses = async ({
	db,
	internalCustomerId,
	liveParentStartTimes,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	liveParentStartTimes: number[];
}): Promise<StrandedCustomerLicense[]> => {
	if (liveParentStartTimes.length === 0) return [];
	const endedAtMinMs =
		Math.min(...liveParentStartTimes) - PHASE_BOUNDARY_TOLERANCE_MS;
	const endedAtMaxMs =
		Math.max(...liveParentStartTimes) + PHASE_BOUNDARY_TOLERANCE_MS;

	const parentProduct = alias(products, "parent_product");
	const licenseProduct = alias(products, "license_product");
	const rows = await db
		.select({
			customerLicense: customerLicenses,
			parentEndedAt: customerProducts.ended_at,
			parentGroup: parentProduct.group,
			licensePlanId: licenseProduct.id,
		})
		.from(customerLicenses)
		.innerJoin(
			customerProducts,
			eq(customerLicenses.parent_customer_product_id, customerProducts.id),
		)
		.innerJoin(
			parentProduct,
			eq(customerProducts.internal_product_id, parentProduct.internal_id),
		)
		.innerJoin(
			licenseProduct,
			eq(
				customerLicenses.license_internal_product_id,
				licenseProduct.internal_id,
			),
		)
		.where(
			and(
				eq(customerLicenses.internal_customer_id, internalCustomerId),
				eq(customerProducts.status, CusProductStatus.Expired),
				gte(customerProducts.ended_at, endedAtMinMs),
				lte(customerProducts.ended_at, endedAtMaxMs),
			),
		);
	return rows
		.flatMap((row) =>
			row.parentEndedAt === null
				? []
				: [{ ...row, parentEndedAt: row.parentEndedAt }],
		)
		.sort(
			(a, b) =>
				a.customerLicense.created_at - b.customerLicense.created_at ||
				a.customerLicense.id.localeCompare(b.customerLicense.id),
		);
};
