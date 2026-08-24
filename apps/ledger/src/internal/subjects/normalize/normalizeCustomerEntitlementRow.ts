import type { customerEntitlements } from "../../../sqlite/common/schema/customerEntitlements.js";

type CustomerEntitlementRow = typeof customerEntitlements.$inferInsert;

export type NormalizedCustomerEntitlementRow = CustomerEntitlementRow & {
	feature_id: string;
	cache_version: number;
};

export const normalizeCustomerEntitlementRow = ({
	row,
	featureIdByInternalId,
}: {
	row: CustomerEntitlementRow;
	featureIdByInternalId: Map<string, string>;
}): NormalizedCustomerEntitlementRow => ({
	...row,
	feature_id:
		row.feature_id ?? featureIdByInternalId.get(row.internal_feature_id) ?? "",
	cache_version: row.cache_version ?? 0,
});
