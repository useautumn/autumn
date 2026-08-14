import { CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";

const CandidateRowSchema = z.object({
	customer_product_id: z.string(),
	internal_customer_id: z.string(),
	entity_id: z.string().nullable(),
	status: z.enum(CusProductStatus),
	starts_at: z.coerce.number().nullable(),
	canceled_at: z.coerce.number().nullable(),
	ended_at: z.coerce.number().nullable(),
	trial_ends_at: z.coerce.number().nullable(),
});

export type RemoveCandidateRow = {
	customerProductId: string;
	internalCustomerId: string;
	entityId: string | null;
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
};

/** The add's dedup predicate inverted: it skips customer products already
 * holding the row, this one wants exactly those. */
export const selectRemoveCandidateRows = async ({
	db,
	internalCustomerIds,
	scope,
	entitlementIds,
	afterCustomerProductId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	entitlementIds: string[];
	afterCustomerProductId?: string;
	limit?: number;
}): Promise<RemoveCandidateRow[]> => {
	if (entitlementIds.length === 0) return [];

	const rows = await db.execute(sql`
		SELECT
			cp.id AS customer_product_id,
			cp.internal_customer_id,
			entity.id AS entity_id,
			cp.status,
			cp.starts_at,
			cp.canceled_at,
			cp.ended_at,
			cp.trial_ends_at
		FROM customer_products AS cp
		LEFT JOIN entities AS entity
			ON entity.internal_id = cp.internal_entity_id
		WHERE cp.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND ${operationScopeSql({ scope })}
			${afterCustomerProductId ? sql`AND cp.id > ${afterCustomerProductId}` : sql``}
			AND EXISTS (
				SELECT 1
				FROM customer_entitlements AS existing
				WHERE existing.customer_product_id = cp.id
					AND existing.entitlement_id IN (${sqlList({ values: entitlementIds })})
					AND NOT existing.is_pooled_balance
					AND existing.pooled_contribution_id IS NULL
			)
		ORDER BY cp.id
		${limit !== undefined ? sql`LIMIT ${limit}` : sql``}
	`);

	return rows.map((row) => {
		const parsed = CandidateRowSchema.parse(row);
		return {
			customerProductId: parsed.customer_product_id,
			internalCustomerId: parsed.internal_customer_id,
			entityId: parsed.entity_id,
			status: parsed.status,
			startsAt: parsed.starts_at,
			canceledAt: parsed.canceled_at,
			endedAt: parsed.ended_at,
			trialEndsAt: parsed.trial_ends_at,
		};
	});
};
