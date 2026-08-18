import {
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import { cycleAnchorSourcesSql } from "@/internal/migrations/v2/batchOperations/actions/utils/cycleAnchorSql.js";
import { rowIsUnpaidSql } from "@/internal/migrations/v2/batchOperations/actions/utils/rowIsUnpaidSql.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { CycleEnrichmentCandidate } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";

const nullableNumeric = z.preprocess(
	(value) => (value === null || value === undefined ? null : Number(value)),
	z.number().nullable(),
);

const ReplaceCandidateRowSchema = z.object({
	customerEntitlementId: z.string(),
	customerProductId: z.string(),
	internalCustomerId: z.string(),
	customerId: z.string().nullable(),
	entityId: z.string().nullable(),
	status: z.enum(CusProductStatus),
	startsAt: nullableNumeric,
	canceledAt: nullableNumeric,
	endedAt: nullableNumeric,
	trialEndsAt: nullableNumeric,
	isPaidRecurring: z.boolean(),
	billingCycleAnchor: nullableNumeric,
	subscriptionCycleAnchor: nullableNumeric,
	siblingResetCycleAnchor: nullableNumeric,
	liveBalance: nullableNumeric,
	liveNextResetAt: nullableNumeric,
});

export type ReplaceCandidateRow = CycleEnrichmentCandidate & {
	customerEntitlementId: string;
	liveBalance: number | null;
	liveNextResetAt: number | null;
};

/** Selects scoped live from-rows and cycle anchors; selecting by from-id
 * makes replay idempotent. */
export const selectReplaceCandidateRows = async ({
	db,
	internalCustomerIds,
	scope,
	entitlement,
	fromEntitlementIds,
	includeAnchorSources,
	afterCustomerProductId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	/** The minted to-entitlement; drives the sibling anchor's interval match. */
	entitlement: EntitlementWithFeature;
	fromEntitlementIds: string[];
	includeAnchorSources: boolean;
	afterCustomerProductId?: string;
	limit: number;
}): Promise<ReplaceCandidateRow[]> => {
	if (internalCustomerIds.length === 0 || fromEntitlementIds.length === 0) {
		return [];
	}

	const targetInterval = String(entitlement.interval ?? EntInterval.Lifetime);
	const targetIntervalCount = entitlement.interval_count ?? 1;
	const anchors = cycleAnchorSourcesSql({
		include: includeAnchorSources,
		customerProductId: sql`cp.id`,
		subscriptionIds: sql`cp.subscription_ids`,
		targetInterval,
		targetIntervalCount,
		keepLiveRowAnchor: true,
	});

	const rows = await db.execute(sql`
		SELECT
			live.id AS "customerEntitlementId",
			cp.id AS "customerProductId",
			cp.internal_customer_id AS "internalCustomerId",
			customer.id AS "customerId",
			entity.id AS "entityId",
			cp.status AS "status",
			cp.starts_at AS "startsAt",
			cp.canceled_at AS "canceledAt",
			cp.ended_at AS "endedAt",
			cp.trial_ends_at AS "trialEndsAt",
			${anchors.paidRecurringColumn} AS "isPaidRecurring",
			cp.billing_cycle_anchor AS "billingCycleAnchor",
			${anchors.subscriptionAnchorColumn} AS "subscriptionCycleAnchor",
			${anchors.siblingAnchorColumn} AS "siblingResetCycleAnchor",
			live.balance AS "liveBalance",
			live.next_reset_at AS "liveNextResetAt"
		FROM customer_products AS cp
		INNER JOIN customer_entitlements AS live
			ON live.customer_product_id = cp.id
			AND live.entitlement_id IN (${sqlList({ values: fromEntitlementIds })})
		INNER JOIN customers AS customer
			ON customer.internal_id = cp.internal_customer_id
		LEFT JOIN entities AS entity
			ON entity.internal_id = cp.internal_entity_id
		${anchors.siblingJoin}
		${anchors.subscriptionJoin}
		WHERE cp.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND ${operationScopeSql({ scope })}
			AND ${rowIsUnpaidSql({
				customerProductId: sql`cp.id`,
				entitlementId: sql`live.entitlement_id`,
			})}
			${afterCustomerProductId ? sql`AND cp.id > ${afterCustomerProductId}` : sql``}
		ORDER BY cp.id
		LIMIT ${limit}
	`);

	return rows.map((row) => {
		const parsed = ReplaceCandidateRowSchema.parse(row);
		return {
			customerEntitlementId: parsed.customerEntitlementId,
			customerProductId: parsed.customerProductId,
			internalCustomerId: parsed.internalCustomerId,
			customerId: parsed.customerId,
			entityId: parsed.entityId,
			status: parsed.status,
			startsAt: parsed.startsAt,
			canceledAt: parsed.canceledAt,
			endedAt: parsed.endedAt,
			trialEndsAt: parsed.trialEndsAt,
			isPaidRecurring: parsed.isPaidRecurring,
			billingCycleAnchor: parsed.billingCycleAnchor,
			subscriptionCycleAnchor: parsed.subscriptionCycleAnchor,
			siblingResetCycleAnchor: parsed.siblingResetCycleAnchor,
			liveBalance: parsed.liveBalance,
			liveNextResetAt: parsed.liveNextResetAt,
		};
	});
};
