import { customerProducts } from "@autumn/shared";
import { and, count, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { activeAssignmentConditions } from "../licenseAssignmentRepo.js";

/** Live seats per customer license, as an aggregate — reconcile never loads
 * seat rows. Output is bounded by customer license count, not seats. */
export const countActiveByCustomerLicenseIds = async ({
	db,
	customerLicenseIds,
}: {
	db: DrizzleCli;
	customerLicenseIds: string[];
}): Promise<Map<string, number>> => {
	if (customerLicenseIds.length === 0) return new Map();
	const rows = await db
		.select({
			customerLicenseId: customerProducts.customer_license_id,
			value: count(),
		})
		.from(customerProducts)
		.where(
			and(
				inArray(customerProducts.customer_license_id, customerLicenseIds),
				...activeAssignmentConditions(),
			),
		)
		.groupBy(customerProducts.customer_license_id);
	return new Map(
		rows
			.filter((row) => row.customerLicenseId !== null)
			.map((row) => [row.customerLicenseId as string, row.value]),
	);
};
