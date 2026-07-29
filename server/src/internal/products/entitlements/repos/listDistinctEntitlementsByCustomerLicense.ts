import {
	ACTIVE_STATUSES,
	customerEntitlements,
	customerProducts,
	type EntitlementWithFeature,
	entitlements,
	features,
} from "@autumn/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const listDistinctEntitlementsByCustomerLicense = async ({
	db,
	customerLicenseLinkId,
	limit,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	limit: number;
}): Promise<EntitlementWithFeature[]> => {
	const rows = await db
		.selectDistinct({ entitlement: entitlements, feature: features })
		.from(customerEntitlements)
		.innerJoin(
			customerProducts,
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.innerJoin(
			entitlements,
			eq(customerEntitlements.entitlement_id, entitlements.id),
		)
		.innerJoin(
			features,
			eq(entitlements.internal_feature_id, features.internal_id),
		)
		.where(
			and(
				eq(customerProducts.customer_license_link_id, customerLicenseLinkId),
				inArray(customerProducts.status, ACTIVE_STATUSES),
			),
		)
		.orderBy(asc(entitlements.id))
		.limit(limit);

	return rows.map(({ entitlement, feature }) => ({
		...entitlement,
		feature,
	})) as EntitlementWithFeature[];
};
