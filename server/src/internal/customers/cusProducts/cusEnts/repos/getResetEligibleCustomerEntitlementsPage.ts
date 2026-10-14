import { customerEntitlements } from "@autumn/shared";
import { and, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { resetCronQueryTag } from "@/internal/balances/batchReset/resetCronQueryTag.js";

export type ResetScanCursor = {
	nextResetAt: number;
	id: string;
};

export type ResetEligibleCustomerEntitlementRow = {
	id: string;
	nextResetAt: number;
	internalCustomerId: string;
	internalEntityId: string | null;
	customerProductId: string | null;
};

export const resetEligibleFilterSql = ({ dueBefore }: { dueBefore: number }) =>
	sql`${customerEntitlements.next_reset_at} < ${dueBefore}
		AND ${customerEntitlements.expired} IS NOT TRUE
		AND ${customerEntitlements.reset_by_invoice} IS NOT TRUE
		AND ${customerEntitlements.pooled_contribution_id} IS NULL
		AND (${customerEntitlements.expires_at} IS NULL OR ${customerEntitlements.expires_at} > ${dueBefore})`;

export const buildResetEligiblePageQuery = ({
	db,
	dueBefore,
	cursor,
	limit,
}: {
	db: DrizzleCli;
	dueBefore: number;
	cursor: ResetScanCursor | null;
	limit: number;
}) => {
	const query = db
		.select({
			id: customerEntitlements.id,
			next_reset_at: customerEntitlements.next_reset_at,
			internal_customer_id: customerEntitlements.internal_customer_id,
			internal_entity_id: customerEntitlements.internal_entity_id,
			customer_product_id: customerEntitlements.customer_product_id,
		})
		.from(customerEntitlements)
		.where(
			and(
				resetEligibleFilterSql({ dueBefore }),
				cursor
					? sql`(${customerEntitlements.next_reset_at}, ${customerEntitlements.id} COLLATE "C") > (${cursor.nextResetAt}, ${cursor.id})`
					: undefined,
			),
		)
		.orderBy(
			customerEntitlements.next_reset_at,
			sql`${customerEntitlements.id} COLLATE "C"`,
		)
		.limit(limit);

	return sql`
		${query}
		${resetCronQueryTag("scanEligible")}
	`;
};

export const getResetEligibleCustomerEntitlementsPage = async ({
	db,
	dueBefore,
	cursor,
	limit,
}: {
	db: DrizzleCli;
	dueBefore: number;
	cursor: ResetScanCursor | null;
	limit: number;
}): Promise<ResetEligibleCustomerEntitlementRow[]> => {
	const rows = await db.execute<{
		id: string;
		next_reset_at: number;
		internal_customer_id: string;
		internal_entity_id: string | null;
		customer_product_id: string | null;
	}>(buildResetEligiblePageQuery({ db, dueBefore, cursor, limit }));

	return rows.map((row) => ({
		id: row.id,
		nextResetAt: Number(row.next_reset_at),
		internalCustomerId: row.internal_customer_id,
		internalEntityId: row.internal_entity_id,
		customerProductId: row.customer_product_id,
	}));
};
