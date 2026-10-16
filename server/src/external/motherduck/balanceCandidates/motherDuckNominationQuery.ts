import type {
	AppEnv,
	CustomerListFilters,
	FeatureBalanceSortBasis,
	SortOrder,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import {
	basisExprSql,
	nominationClausesSql,
} from "@/internal/customers/balanceCandidates/balanceTotalsSql.js";
import type { BalanceThresholdFilter } from "@/internal/customers/balanceCandidates/types/balanceThresholdFilter.js";
import type { NominationCursor } from "@/internal/customers/balanceCandidates/types/nominationCursor.js";

/** Lake nominations per top-up iteration; sized so one batch usually fills a
 * 250 page even after expired-row inflation (~12% table-wide) and filters. */
export const MOTHERDUCK_NOMINATION_BATCH_SIZE = 500;

export const nominationQuery = ({
	orgId,
	env,
	createdAtRange,
	internalFeatureId,
	after,
	sortOrder,
	basis,
	remainingFilter,
}: {
	orgId: string;
	env: AppEnv;
	createdAtRange?: CustomerListFilters["created_at_range"];
	internalFeatureId: string;
	after: NominationCursor | null;
	sortOrder: SortOrder;
	basis: FeatureBalanceSortBasis;
	remainingFilter?: BalanceThresholdFilter;
}): SQL => {
	const hasCreatedAtRange =
		createdAtRange?.start !== undefined || createdAtRange?.end !== undefined;
	const customerScopeJoin = hasCreatedAtRange
		? sql`
			SEMI JOIN main.customers c
				ON c.internal_id = ce_balance_totals.internal_customer_id
				AND c.org_id = ${orgId}
				AND c.env = ${env}
				${
					createdAtRange?.start !== undefined
						? sql`AND c.created_at >= ${createdAtRange.start}`
						: sql``
				}
				${
					createdAtRange?.end !== undefined
						? sql`AND c.created_at <= ${createdAtRange.end}`
						: sql``
				}
		`
		: sql``;
	const { thresholdPredicate, cursorPredicate, orderBy } = nominationClausesSql(
		{ after, sortOrder, basis, remainingFilter },
	);

	return sql`
		SELECT internal_customer_id, is_unlimited, ${basisExprSql(basis)} AS total
		FROM main.ce_balance_totals
		${customerScopeJoin}
		WHERE internal_feature_id = ${internalFeatureId}
		${thresholdPredicate}
		${cursorPredicate}
		ORDER BY ${orderBy}
		LIMIT ${MOTHERDUCK_NOMINATION_BATCH_SIZE}
	`;
};
