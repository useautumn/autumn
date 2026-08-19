import {
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
import type { OperationScope } from "../scope/operationScope.js";
import { operationScopeSql } from "../scope/operationScope.js";
import { canonicalPoolLateralSql } from "./licensePoolSql.js";
import { cycleAnchorSourcesSql } from "./utils/cycleAnchorSql.js";
import { pageCustomerIdsCte } from "./utils/pageCustomerIdsSql.js";

const nullableNumeric = z.preprocess(
	(value) => (value === null || value === undefined ? null : Number(value)),
	z.number().nullable(),
);

const LicenseCandidateRowSchema = z.object({
	customerEntitlementId: z.string().nullable(),
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
	liveBalance: nullableNumeric,
	liveNextResetAt: nullableNumeric,
});

export type LicenseCandidateRow = z.infer<typeof LicenseCandidateRowSchema>;

export type LicenseReplaceCandidateRow = LicenseCandidateRow & {
	customerEntitlementId: string;
};

const LicenseReplaceCandidateRowSchema = LicenseCandidateRowSchema.extend({
	customerEntitlementId: z.string(),
});

type SelectLicenseCandidateRowsBase = {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	entitlement: EntitlementWithFeature;
	licensePlanId: string;
	afterCustomerProductId?: string;
	limit: number;
};

export type SelectLicenseCandidateRowsArgs = SelectLicenseCandidateRowsBase &
	({ match: "add" } | { match: "replace"; fromEntitlementIds: string[] });

const matchSql = ({
	match,
	entitlement,
	fromEntitlementIds,
	targetInterval,
	targetIntervalCount,
}: {
	match: SelectLicenseCandidateRowsArgs["match"];
	entitlement: EntitlementWithFeature;
	fromEntitlementIds: string[];
	targetInterval: string;
	targetIntervalCount: number;
}) => {
	if (match === "add") {
		const dedupIntervalCondition = isBooleanEntitlement({ entitlement })
			? sql``
			: sql`AND COALESCE(existing_definition.interval, ${EntInterval.Lifetime}) = ${targetInterval}
				AND COALESCE(existing_definition.interval_count, 1) = ${targetIntervalCount}`;
		return {
			join: sql``,
			customerEntitlementId: sql`NULL::text`,
			entitlementId: sql`${entitlement.id}`,
			internalFeatureId: sql`${entitlement.internal_feature_id}`,
			featureId: sql`${entitlement.feature.id}`,
			liveBalance: sql`NULL::numeric`,
			liveNextResetAt: sql`NULL::numeric`,
			extraWhere: sql`
				AND EXISTS (
					SELECT 1
					FROM license_entitlements AS le
					WHERE le.plan_license_id = pool.plan_license_id
						AND le.entitlement_id = ${entitlement.id}
				)
				AND NOT EXISTS (
					SELECT 1
					FROM customer_entitlements AS existing
					INNER JOIN entitlements AS existing_definition
						ON existing_definition.id = existing.entitlement_id
					WHERE existing.customer_product_id = assignment.id
						AND existing.internal_feature_id = ${entitlement.internal_feature_id}
						${dedupIntervalCondition}
				)`,
		};
	}

	return {
		join: sql`
			INNER JOIN customer_entitlements AS live
				ON live.customer_product_id = assignment.id
				AND live.entitlement_id IN (${sqlList({ values: fromEntitlementIds })})`,
		customerEntitlementId: sql`live.id`,
		entitlementId: sql`${entitlement.id}`,
		internalFeatureId: sql`${entitlement.internal_feature_id}`,
		featureId: sql`${entitlement.feature.id}`,
		liveBalance: sql`live.balance`,
		liveNextResetAt: sql`live.next_reset_at`,
		extraWhere: sql``,
	};
};

type BuildLicenseCandidateRowsQueryArgs = Omit<
	SelectLicenseCandidateRowsBase,
	"db"
> &
	({ match: "add" } | { match: "replace"; fromEntitlementIds: string[] });

/** Live assignments under the page's license pool, with parent-anchor sources.
 * `add` is insert-if-absent; `replace` is rows already holding a from-definition. */
export const buildLicenseCandidateRowsQuery = ({
	internalCustomerIds,
	scope,
	entitlement,
	licensePlanId,
	afterCustomerProductId,
	limit,
	match,
	...rest
}: BuildLicenseCandidateRowsQueryArgs) => {
	const fromEntitlementIds =
		"fromEntitlementIds" in rest ? rest.fromEntitlementIds : [];
	const targetInterval = String(entitlement.interval ?? EntInterval.Lifetime);
	const targetIntervalCount = entitlement.interval_count ?? 1;
	const matched = matchSql({
		match,
		entitlement,
		fromEntitlementIds,
		targetInterval,
		targetIntervalCount,
	});
	const anchors = cycleAnchorSourcesSql({
		include: true,
		customerProductId: sql`assignment.id`,
		subscriptionIds: sql`cp.subscription_ids`,
		targetInterval,
		targetIntervalCount,
		keepLiveRowAnchor: match === "replace",
	});

	return sql`
		WITH ${pageCustomerIdsCte({ internalCustomerIds })}
		SELECT
			${matched.customerEntitlementId} AS "customerEntitlementId",
			assignment.id AS "customerProductId",
			assignment.internal_customer_id AS "internalCustomerId",
			customer.id AS "customerId",
			entity.id AS "entityId",
			assignment.internal_entity_id AS "internalEntityId",
			${matched.entitlementId} AS "entitlementId",
			${matched.internalFeatureId} AS "internalFeatureId",
			${matched.featureId} AS "featureId",
			assignment.status AS "status",
			COALESCE(cp.starts_at, assignment.starts_at) AS "startsAt",
			assignment.starts_at AS "assignmentStartsAt",
			assignment.canceled_at AS "canceledAt",
			assignment.ended_at AS "endedAt",
			assignment.trial_ends_at AS "trialEndsAt",
			${anchors.paidRecurringColumn} AS "isPaidRecurring",
			cp.billing_cycle_anchor AS "billingCycleAnchor",
			${anchors.subscriptionAnchorColumn} AS "subscriptionCycleAnchor",
			${anchors.siblingAnchorColumn} AS "siblingResetCycleAnchor",
			${matched.liveBalance} AS "liveBalance",
			${matched.liveNextResetAt} AS "liveNextResetAt"
		FROM page
		INNER JOIN customer_products AS assignment
			ON assignment.internal_customer_id = page.internal_customer_id
		${canonicalPoolLateralSql({ licensePlanId, columns: sql`pool.*` })}
		INNER JOIN customer_products AS cp
			ON cp.id = pool.parent_customer_product_id
		${matched.join}
		INNER JOIN customers AS customer
			ON customer.internal_id = assignment.internal_customer_id
		LEFT JOIN entities AS entity
			ON entity.internal_id = assignment.internal_entity_id
		${anchors.siblingJoin}
		${anchors.subscriptionJoin}
		WHERE assignment.internal_entity_id IS NOT NULL
			AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND ${operationScopeSql({ scope })}
			${afterCustomerProductId ? sql`AND assignment.id > ${afterCustomerProductId}` : sql``}
			${matched.extraWhere}
		ORDER BY assignment.id
		LIMIT ${limit}
	`;
};

export async function selectLicenseCandidateRows(
	args: SelectLicenseCandidateRowsBase & { match: "add" },
): Promise<LicenseCandidateRow[]>;
export async function selectLicenseCandidateRows(
	args: SelectLicenseCandidateRowsBase & {
		match: "replace";
		fromEntitlementIds: string[];
	},
): Promise<LicenseReplaceCandidateRow[]>;
export async function selectLicenseCandidateRows({
	db,
	...queryArgs
}: SelectLicenseCandidateRowsArgs): Promise<
	LicenseCandidateRow[] | LicenseReplaceCandidateRow[]
> {
	const fromEntitlementIds =
		"fromEntitlementIds" in queryArgs ? queryArgs.fromEntitlementIds : [];
	if (
		queryArgs.internalCustomerIds.length === 0 ||
		(queryArgs.match === "replace" && fromEntitlementIds.length === 0)
	) {
		return [];
	}

	const rows = await db.execute(buildLicenseCandidateRowsQuery(queryArgs));

	if (queryArgs.match === "replace") {
		return rows.map((row) => LicenseReplaceCandidateRowSchema.parse(row));
	}
	return rows.map((row) => LicenseCandidateRowSchema.parse(row));
}
