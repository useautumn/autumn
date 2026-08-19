import {
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	isBooleanEntitlement,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { cycleAnchorSourcesSql } from "@/internal/migrations/v2/batchOperations/actions/utils/cycleAnchorSql.js";
import { pageCustomerIdsCte } from "@/internal/migrations/v2/batchOperations/actions/utils/pageCustomerIdsSql.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { CycleEnrichmentCandidate } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";

const nullableNumeric = z.preprocess(
	(value) => (value === null || value === undefined ? null : Number(value)),
	z.number().nullable(),
);

const CandidateRowSchema = z.object({
	customer_product_id: z.string(),
	internal_customer_id: z.string(),
	customer_id: z.string().nullable(),
	entity_id: z.string().nullable(),
	status: z.enum(CusProductStatus),
	starts_at: nullableNumeric,
	canceled_at: nullableNumeric,
	ended_at: nullableNumeric,
	trial_ends_at: nullableNumeric,
	is_paid_recurring: z.boolean(),
	billing_cycle_anchor: nullableNumeric,
	subscription_cycle_anchor: nullableNumeric,
	sibling_reset_cycle_anchor: nullableNumeric,
});

/**
 * Selects the page's add candidates: scope + itemAlreadyExists-parity dedup
 * (same feature — feature-only for booleans, same reset interval otherwise;
 * this also makes replay idempotent). `includeAnchorSources` adds the cycle
 * anchor columns resetting (consumable/credit) adds need for enrichment.
 * `afterCustomerProductId` + `limit` keyset-paginate by cp.id so row-heavy
 * pages read in bounded batches.
 */
export const buildAddCandidateRowsQuery = ({
	internalCustomerIds,
	scope,
	entitlement,
	includeAnchorSources,
	afterCustomerProductId,
	limit,
}: {
	internalCustomerIds: string[];
	scope: OperationScope;
	entitlement: EntitlementWithFeature;
	includeAnchorSources: boolean;
	afterCustomerProductId?: string;
	limit?: number;
}) => {
	const targetInterval = String(entitlement.interval ?? EntInterval.Lifetime);
	const targetIntervalCount = entitlement.interval_count ?? 1;

	const dedupIntervalCondition = isBooleanEntitlement({ entitlement })
		? sql``
		: sql`AND COALESCE(existing_definition.interval, ${EntInterval.Lifetime}) = ${targetInterval}`;

	const anchors = cycleAnchorSourcesSql({
		include: includeAnchorSources,
		customerProductId: sql`cp.id`,
		subscriptionIds: sql`cp.subscription_ids`,
		targetInterval,
		targetIntervalCount,
	});

	return sql`
		WITH ${pageCustomerIdsCte({ internalCustomerIds })}
		SELECT
			cp.id AS customer_product_id,
			cp.internal_customer_id,
			customer.id AS customer_id,
			entity.id AS entity_id,
			cp.status,
			cp.starts_at,
			cp.canceled_at,
			cp.ended_at,
			cp.trial_ends_at,
			${anchors.paidRecurringColumn} AS is_paid_recurring,
			cp.billing_cycle_anchor,
			${anchors.subscriptionAnchorColumn} AS subscription_cycle_anchor,
			${anchors.siblingAnchorColumn} AS sibling_reset_cycle_anchor
		FROM page
		INNER JOIN customer_products AS cp
			ON cp.internal_customer_id = page.internal_customer_id
		INNER JOIN customers AS customer
			ON customer.internal_id = cp.internal_customer_id
		LEFT JOIN entities AS entity
			ON entity.internal_id = cp.internal_entity_id
		${anchors.siblingJoin}
		${anchors.subscriptionJoin}
		WHERE ${operationScopeSql({ scope })}
			${afterCustomerProductId ? sql`AND cp.id > ${afterCustomerProductId}` : sql``}
			AND NOT EXISTS (
				SELECT 1
				FROM customer_entitlements AS existing
				INNER JOIN entitlements AS existing_definition
					ON existing_definition.id = existing.entitlement_id
				WHERE existing.customer_product_id = cp.id
					AND existing.internal_feature_id = ${entitlement.internal_feature_id}
					${dedupIntervalCondition}
			)
		ORDER BY cp.id
		${limit !== undefined ? sql`LIMIT ${limit}` : sql``}
	`;
};

export const selectAddCandidateRows = async ({
	db,
	internalCustomerIds,
	scope,
	entitlement,
	includeAnchorSources,
	afterCustomerProductId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	entitlement: EntitlementWithFeature;
	includeAnchorSources: boolean;
	afterCustomerProductId?: string;
	limit?: number;
}): Promise<CycleEnrichmentCandidate[]> => {
	const rows = await db.execute(
		buildAddCandidateRowsQuery({
			internalCustomerIds,
			scope,
			entitlement,
			includeAnchorSources,
			afterCustomerProductId,
			limit,
		}),
	);

	return rows.map((row) => {
		const parsed = CandidateRowSchema.parse(row);
		return {
			customerProductId: parsed.customer_product_id,
			internalCustomerId: parsed.internal_customer_id,
			customerId: parsed.customer_id,
			entityId: parsed.entity_id,
			status: parsed.status,
			startsAt: parsed.starts_at,
			canceledAt: parsed.canceled_at,
			endedAt: parsed.ended_at,
			trialEndsAt: parsed.trial_ends_at,
			isPaidRecurring: parsed.is_paid_recurring,
			billingCycleAnchor: parsed.billing_cycle_anchor,
			subscriptionCycleAnchor: parsed.subscription_cycle_anchor,
			siblingResetCycleAnchor: parsed.sibling_reset_cycle_anchor,
		};
	});
};
