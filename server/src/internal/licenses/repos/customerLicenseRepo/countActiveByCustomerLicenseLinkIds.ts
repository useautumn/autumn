import { customerProducts } from "@autumn/shared";
import { and, count, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { activeAssignmentConditions } from "../licenseAssignmentRepo.js";

/** Live seats per pool link, as an aggregate — reconcile never loads seat
 * rows. Output is bounded by customer license count, not seats. */
export const countActiveByCustomerLicenseLinkIds = async ({
	db,
	customerLicenseLinkIds,
}: {
	db: DrizzleCli;
	customerLicenseLinkIds: string[];
}): Promise<Map<string, number>> => {
	if (customerLicenseLinkIds.length === 0) return new Map();
	const rows = await db
		.select({
			customerLicenseLinkId: customerProducts.customer_license_link_id,
			value: count(),
		})
		.from(customerProducts)
		.where(
			and(
				inArray(
					customerProducts.customer_license_link_id,
					customerLicenseLinkIds,
				),
				...activeAssignmentConditions(),
			),
		)
		.groupBy(customerProducts.customer_license_link_id);
	return new Map(
		rows
			.filter((row) => row.customerLicenseLinkId !== null)
			.map((row) => [row.customerLicenseLinkId as string, row.value]),
	);
};
