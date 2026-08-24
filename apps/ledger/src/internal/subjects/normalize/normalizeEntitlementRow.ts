import type { entitlements } from "../../../sqlite/common/schema/entitlements.js";

type EntitlementRow = typeof entitlements.$inferInsert;

export type NormalizedEntitlementRow = EntitlementRow & {
	interval_count: number;
	is_custom: boolean;
};

export const normalizeEntitlementRow = ({
	row,
}: {
	row: EntitlementRow;
}): NormalizedEntitlementRow => ({
	...row,
	interval_count: row.interval_count ?? 1,
	is_custom: row.is_custom ?? false,
});
