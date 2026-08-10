import {
	BillingInterval,
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	isBooleanEntitlement,
	MIGRATABLE_STATUSES,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import type { OperationScope } from "../../scope/operationScope.js";
import { operationScopeSql } from "../../scope/operationScope.js";

const nullableNumeric = z.preprocess(
	(value) => (value === null || value === undefined ? null : Number(value)),
	z.number().nullable(),
);

const CandidateRowSchema = z.object({
	customerProductId: z.string(),
	internalCustomerId: z.string(),
	customerId: z.string().nullable(),
	entityId: z.string().nullable(),
	internalEntityId: z.string().nullable(),
	entitlementId: z.string(),
	internalFeatureId: z.string(),
	featureId: z.string(),
	status: z.enum(CusProductStatus),
	startsAt: nullableNumeric,
	assignmentStartsAt: nullableNumeric,
	canceledAt: nullableNumeric,
	endedAt: nullableNumeric,
	trialEndsAt: nullableNumeric,
	isPaidRecurring: z.boolean(),
	billingCycleAnchor: nullableNumeric,
	subscriptionCycleAnchor: nullableNumeric,
	siblingResetCycleAnchor: nullableNumeric,
});

export type LicenseCandidateRow = z.infer<typeof CandidateRowSchema>;

/**
 * Live assignments whose pool anchors a customized link carrying this feature.
 * Matched on the license product too, not just the feature — a parent may hold
 * links to several license plans, and their definitions can share a feature.
 * The parent is aliased `cp` so the plan filter's lowered scope applies to it —
 * assignments own no lifecycle, so status must come from the parent too.
 */
export const selectLicenseAddCandidateRows = async ({
	db,
	internalCustomerIds,
	scope,
	entitlement,
	licenseInternalProductId,
	afterCustomerProductId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	entitlement: EntitlementWithFeature;
	licenseInternalProductId: string;
	afterCustomerProductId?: string;
	limit: number;
}): Promise<LicenseCandidateRow[]> => {
	if (internalCustomerIds.length === 0) return [];

	const targetInterval = String(entitlement.interval ?? EntInterval.Lifetime);
	const targetIntervalCount = entitlement.interval_count ?? 1;

	const dedupIntervalCondition = isBooleanEntitlement({ entitlement })
		? sql``
		: sql`AND COALESCE(existing_definition.interval, ${EntInterval.Lifetime}) = ${targetInterval}`;

	const rows = await db.execute(sql`
		SELECT
			assignment.id AS "customerProductId",
			assignment.internal_customer_id AS "internalCustomerId",
			customer.id AS "customerId",
			entity.id AS "entityId",
			assignment.internal_entity_id AS "internalEntityId",
			e.id AS "entitlementId",
			e.internal_feature_id AS "internalFeatureId",
			f.id AS "featureId",
			assignment.status AS "status",
			-- The ladder's last rung anchors here, and an assignment bills on the
			-- parent's cycle — setupAttachLicenseContext anchors a seat off the
			-- parent too. assignmentStartsAt carries the seat's own date for the
			-- webhook snapshot.
			COALESCE(cp.starts_at, assignment.starts_at) AS "startsAt",
			assignment.starts_at AS "assignmentStartsAt",
			assignment.canceled_at AS "canceledAt",
			assignment.ended_at AS "endedAt",
			assignment.trial_ends_at AS "trialEndsAt",
			EXISTS (
				SELECT 1
				FROM customer_prices AS customer_price
				INNER JOIN prices AS price ON price.id = customer_price.price_id
				WHERE customer_price.customer_product_id = assignment.id
					AND price.config->>'interval' IS DISTINCT FROM ${BillingInterval.OneOff}
			) AS "isPaidRecurring",
			COALESCE(
				assignment.billing_cycle_anchor,
				cp.billing_cycle_anchor
			) AS "billingCycleAnchor",
			sub_anchor.billing_cycle_anchor_ms AS "subscriptionCycleAnchor",
			sibling.reset_cycle_anchor AS "siblingResetCycleAnchor"
		FROM customer_products AS assignment
		JOIN LATERAL (
			SELECT pool.*
			FROM customer_licenses AS pool
			JOIN customer_products AS pool_parent
				ON pool_parent.id = pool.parent_customer_product_id
			WHERE pool.link_id = assignment.customer_license_link_id
				AND pool.license_internal_product_id = ${licenseInternalProductId}
			ORDER BY (pool_parent.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})) DESC,
				pool.created_at DESC, pool.id DESC
			LIMIT 1
		) AS pool ON true
		INNER JOIN customer_products AS cp
			ON cp.id = pool.parent_customer_product_id
		INNER JOIN license_entitlements AS le
			ON le.plan_license_id = pool.plan_license_id
		INNER JOIN entitlements AS e
			ON e.id = le.entitlement_id
		INNER JOIN features AS f
			ON f.internal_id = e.internal_feature_id
		INNER JOIN customers AS customer
			ON customer.internal_id = assignment.internal_customer_id
		LEFT JOIN entities AS entity
			ON entity.internal_id = assignment.internal_entity_id
		-- Anchors are synced in SECONDS; the ladder is ms throughout.
		LEFT JOIN LATERAL (
			SELECT subscription.billing_cycle_anchor_seconds * 1000 AS billing_cycle_anchor_ms
			FROM UNNEST(COALESCE(cp.subscription_ids, ARRAY[]::text[])) AS cp_subscription(stripe_id)
			INNER JOIN subscriptions AS subscription
				ON subscription.stripe_id = cp_subscription.stripe_id
			WHERE subscription.billing_cycle_anchor_seconds IS NOT NULL
			ORDER BY subscription.created_at, subscription.id
			LIMIT 1
		) AS sub_anchor ON true
		LEFT JOIN LATERAL (
			SELECT sibling_entitlement.reset_cycle_anchor
			FROM customer_entitlements AS sibling_entitlement
			INNER JOIN entitlements AS sibling_definition
				ON sibling_definition.id = sibling_entitlement.entitlement_id
			WHERE sibling_entitlement.customer_product_id = assignment.id
				AND NOT sibling_entitlement.separate_interval
				AND sibling_entitlement.reset_cycle_anchor IS NOT NULL
				AND sibling_entitlement.next_reset_at IS NOT NULL
				AND COALESCE(sibling_definition.interval, ${EntInterval.Lifetime}) = ${targetInterval}
				AND COALESCE(sibling_definition.interval_count, 1) = ${targetIntervalCount}
			ORDER BY sibling_entitlement.created_at, sibling_entitlement.id
			LIMIT 1
		) AS sibling ON true
		WHERE assignment.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND assignment.internal_entity_id IS NOT NULL
			AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND e.id = ${entitlement.id}
			AND ${operationScopeSql({ scope })}
			${afterCustomerProductId ? sql`AND assignment.id > ${afterCustomerProductId}` : sql``}
			AND NOT EXISTS (
				SELECT 1
				FROM customer_entitlements AS existing
				INNER JOIN entitlements AS existing_definition
					ON existing_definition.id = existing.entitlement_id
				WHERE existing.customer_product_id = assignment.id
					AND existing.internal_feature_id = ${entitlement.internal_feature_id}
					${dedupIntervalCondition}
			)
		ORDER BY assignment.id
		LIMIT ${limit}
	`);

	return rows.map((row) => CandidateRowSchema.parse(row));
};
