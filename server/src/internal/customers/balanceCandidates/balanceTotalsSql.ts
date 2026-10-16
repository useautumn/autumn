import type {
	BalanceFilterOp,
	FeatureBalanceSortBasis,
	SortOrder,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { BalanceThresholdFilter } from "./types/balanceThresholdFilter.js";
import type { NominationCursor } from "./types/nominationCursor.js";

/** Column of the per-customer totals relation (`ce_balance_totals` shape) for
 * each basis. Both candidate sources expose the same column names. */
export const basisExprSql = (basis: FeatureBalanceSortBasis): SQL => {
	if (basis === "granted") return sql.raw("granted_total");
	if (basis === "usage") return sql.raw("usage_total");
	return sql.raw("total");
};

/** ∞ > x is true, 5 < ∞ is false: `>` on remaining/granted ADMITS every
 * unlimited holder (exports must include them); `<` excludes pure-unlimited.
 * Usage is real on every row, so neither rule applies there. */
export const unlimitedPassesThreshold = ({
	basis,
	op,
}: {
	basis: FeatureBalanceSortBasis;
	op: BalanceFilterOp;
}): boolean => basis !== "usage" && op === ">";

export const thresholdRequiresFiniteRows = ({
	basis,
	op,
}: {
	basis: FeatureBalanceSortBasis;
	op: BalanceFilterOp;
}): boolean => basis !== "usage" && op === "<";

/** The unlimited stripe orders remaining/granted sorts (no number to rank
 * unlimited customers by); usage ranks everyone by their real number, and a
 * `<` filter passes rows on finite merit so the stripe stands down there too. */
export const stripeSuppressed = ({
	basis,
	remainingFilter,
}: {
	basis: FeatureBalanceSortBasis;
	remainingFilter?: BalanceThresholdFilter;
}): boolean =>
	basis === "usage" ||
	(remainingFilter !== undefined && !unlimitedPassesThreshold(remainingFilter));

/** SQL twin of `passesBalanceFilter`, shared by the candidate queries and the
 * PG dense walk. */
export const balanceThresholdSql = ({
	totalExpr,
	op,
	value,
}: {
	totalExpr: SQL;
	op: BalanceFilterOp;
	value: number;
}): SQL =>
	op === ">" ? sql`${totalExpr} > ${value}` : sql`${totalExpr} < ${value}`;

/** Threshold over the totals relation, with the per-op unlimited rules. */
export const totalsThresholdSql = (balance: BalanceThresholdFilter): SQL => {
	const thresholdSql = balanceThresholdSql({
		totalExpr: basisExprSql(balance.basis),
		op: balance.op,
		value: balance.value,
	});
	if (unlimitedPassesThreshold(balance)) {
		return sql`(${thresholdSql} OR is_unlimited)`;
	}
	return thresholdRequiresFiniteRows(balance)
		? sql`${thresholdSql} AND finite_rows > 0`
		: thresholdSql;
};

/** Threshold, keyset cursor and ORDER BY for one nomination batch over the
 * totals relation. */
export const nominationClausesSql = ({
	after,
	sortOrder,
	basis,
	remainingFilter,
}: {
	after: NominationCursor | null;
	sortOrder: SortOrder;
	basis: FeatureBalanceSortBasis;
	remainingFilter?: BalanceThresholdFilter;
}): { thresholdPredicate: SQL; cursorPredicate: SQL; orderBy: SQL } => {
	const direction = sql.raw(sortOrder === "asc" ? "ASC" : "DESC");
	const comparator = sql.raw(sortOrder === "asc" ? ">" : "<");
	const basisExpr = basisExprSql(basis);
	// When the stripe is suppressed (verify emits u=false), the cursor/order
	// tuple must drop is_unlimited — a (false, ...) tuple would exclude mixed customers.
	const suppressStripe = stripeSuppressed({ basis, remainingFilter });

	const cursorPredicate = !after
		? sql``
		: suppressStripe
			? sql`AND (${basisExpr}, internal_customer_id) ${comparator} (${after.b}, ${after.id})`
			: sql`AND (is_unlimited, ${basisExpr}, internal_customer_id) ${comparator} (${after.u}, ${after.b}, ${after.id})`;

	// Pre-filter approximately here (verify re-checks exactly): a `< x` threshold
	// against a desc sort otherwise burns every batch on giants that fail verify.
	const thresholdPredicate = remainingFilter
		? sql`AND ${totalsThresholdSql(remainingFilter)}`
		: sql``;

	const orderBy = suppressStripe
		? sql`${basisExpr} ${direction}, internal_customer_id ${direction}`
		: sql`is_unlimited ${direction}, ${basisExpr} ${direction}, internal_customer_id ${direction}`;

	return { thresholdPredicate, cursorPredicate, orderBy };
};
