import { expect } from "bun:test";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import { PLAN_BASE_PRICE_SQL } from "@autumn/shared/api/migrations/compiler/registry/customerRegistry.js";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import { matcherFeatures, type PlanName } from "./matcherFixtures";

/**
 * One row per PlanFilter shape. `matches` is the expected in-memory result
 * per fixture plan. `sql` is what the SQL compiler does with the same filter
 * (wrapped as `{ plan: filter }`, since only the customer registry knows
 * `price` / `item`): either the predicate fragments that encode the row's
 * semantics, or the error it throws because the compiler doesn't support
 * that shape yet. When the compiler gains support, the `throws` rows fail
 * and must be turned into `fragments`.
 */
export type PlanFilterCase = {
	name: string;
	filter: PlanFilter;
	matches: PlanName[];
	sql: { fragments: string[] } | { throws: string };
};

const ITEM_FROM = [
	"FROM customer_entitlements ce",
	"JOIN entitlements e ON e.id = ce.entitlement_id",
	"LEFT JOIN prices pr ON pr.entitlement_id = e.id",
	"LEFT JOIN customer_prices cpr ON cpr.price_id = pr.id AND cpr.customer_product_id = ce.customer_product_id",
	"WHERE ce.customer_product_id = cp.id",
].join(" ");

const ITEM_PAID_FROM = [
	"FROM customer_prices cpr",
	"JOIN prices pr ON pr.id = cpr.price_id",
	"JOIN entitlements e ON e.id = pr.entitlement_id",
	"WHERE cpr.customer_product_id = cp.id",
].join(" ");

const NESTED_PRICE_ERROR =
	"plan.item.price filtering on nested fields is not supported in phase 1";
const ITEM_QUANTIFIER_ERROR = "item: only $some is supported in phase 1";
const UNLIMITED_ERROR = "plan.item.unlimited is not supported in phase 1";

export const PLAN_FILTER_CASES: PlanFilterCase[] = [
	{
		name: "base price null → plans without a base price",
		filter: { price: null },
		matches: ["free", "unlimited", "empty"],
		sql: { fragments: [`${PLAN_BASE_PRICE_SQL} IS NULL`] },
	},
	{
		name: "base price $eq null → same as null",
		filter: { price: { $eq: null } },
		matches: ["free", "unlimited", "empty"],
		sql: { fragments: [`${PLAN_BASE_PRICE_SQL} IS NULL`] },
	},
	{
		name: "base price $ne null → plans with a base price",
		filter: { price: { $ne: null } },
		matches: ["pro"],
		sql: { fragments: [`${PLAN_BASE_PRICE_SQL} IS NOT NULL`] },
	},
	{
		name: "base price {} (nested form) → has a base price",
		filter: { price: {} },
		matches: ["pro"],
		sql: { throws: "plan.item.price requires $eq: null or $ne: null" },
	},
	{
		name: "item feature_id → plans containing the feature",
		filter: { item: { feature_id: "credits" } },
		matches: ["pro"],
		sql: { fragments: [`${ITEM_FROM} AND e.internal_feature_id = ?`] },
	},
	{
		name: "item explicit $some ≡ bare item",
		filter: { item: { $some: { feature_id: "credits" } } },
		matches: ["pro"],
		sql: { fragments: [`${ITEM_FROM} AND e.internal_feature_id = ?`] },
	},
	{
		name: "item price null → plans with a free item",
		filter: { item: { price: null } },
		matches: ["free", "unlimited"],
		sql: { fragments: [`${ITEM_FROM} AND cpr.id IS NULL`] },
	},
	{
		name: "item price $ne null → plans with a paid item",
		filter: { item: { price: { $ne: null } } },
		matches: ["pro", "unlimited"],
		sql: { fragments: [`${ITEM_PAID_FROM} AND cpr.id IS NOT NULL`] },
	},
	{
		name: "item feature + free → only where that feature is free",
		filter: { item: { feature_id: "messages", price: null } },
		matches: ["free"],
		sql: {
			fragments: [
				`${ITEM_FROM} AND (e.internal_feature_id = ? AND cpr.id IS NULL)`,
			],
		},
	},
	{
		name: "item feature + paid → only where that feature is paid",
		filter: { item: { feature_id: "messages", price: { $ne: null } } },
		matches: ["pro"],
		sql: {
			fragments: [
				`${ITEM_PAID_FROM} AND (e.internal_feature_id = ? AND cpr.id IS NOT NULL)`,
			],
		},
	},
	{
		name: "item rollover $ne null → plans with a rollover item",
		filter: { item: { rollover: { $ne: null } } },
		matches: ["pro"],
		sql: { fragments: [`${ITEM_FROM} AND e.rollover IS NOT NULL`] },
	},
	{
		name: "item rollover null → plans with an item without rollover",
		filter: { item: { rollover: null } },
		matches: ["free", "pro", "unlimited"],
		sql: { fragments: [`${ITEM_FROM} AND e.rollover IS NULL`] },
	},
	{
		name: "free base price AND some paid item",
		filter: { price: null, item: { price: { $ne: null } } },
		matches: ["unlimited"],
		sql: {
			fragments: [
				`${PLAN_BASE_PRICE_SQL} IS NULL`,
				`${ITEM_PAID_FROM} AND cpr.id IS NOT NULL`,
			],
		},
	},
	{
		name: "item billing_method prepaid",
		filter: { item: { price: { billing_method: "prepaid" } } },
		matches: ["pro"],
		sql: { throws: NESTED_PRICE_ERROR },
	},
	{
		name: "item billing_method usage_based (consumable and allocated)",
		filter: { item: { price: { billing_method: "usage_based" } } },
		matches: ["pro", "unlimited"],
		sql: { throws: NESTED_PRICE_ERROR },
	},
	{
		name: "item billing_method $in on a feature that is never prepaid",
		filter: {
			item: {
				feature_id: "messages",
				price: { billing_method: { $in: ["prepaid"] } },
			},
		},
		matches: [],
		sql: { throws: NESTED_PRICE_ERROR },
	},
	{
		name: "item unlimited true",
		filter: { item: { unlimited: true } },
		matches: ["unlimited"],
		sql: { throws: UNLIMITED_ERROR },
	},
	{
		name: "item unlimited false",
		filter: { item: { unlimited: false } },
		matches: ["free", "pro", "unlimited"],
		sql: { throws: UNLIMITED_ERROR },
	},
	{
		name: "item $every paid (vacuously true for a plan with no items)",
		filter: { item: { $every: { price: { $ne: null } } } },
		matches: ["pro", "empty"],
		sql: { throws: ITEM_QUANTIFIER_ERROR },
	},
	{
		name: "item $every free",
		filter: { item: { $every: { price: null } } },
		matches: ["free", "empty"],
		sql: { throws: ITEM_QUANTIFIER_ERROR },
	},
	{
		name: "item $none paid",
		filter: { item: { $none: { price: { $ne: null } } } },
		matches: ["free", "empty"],
		sql: { throws: ITEM_QUANTIFIER_ERROR },
	},
	{
		name: "$or of base price and unlimited item",
		filter: {
			$or: [{ price: { $ne: null } }, { item: { unlimited: true } }],
		},
		matches: ["pro", "unlimited"],
		sql: { throws: UNLIMITED_ERROR },
	},
];

export const normalizeSql = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

export const compileCustomerFilter = ({ filter }: { filter: CustomerFilter }) =>
	compileFilter({
		filter,
		ctx: { features: matcherFeatures },
		ambient: { orgId: "org_test", env: "live" },
	});

/** Asserts the SQL compiler's handling of `{ plan: filter }` matches the row. */
export const expectSqlParity = ({ testCase }: { testCase: PlanFilterCase }) => {
	const compile = () =>
		compileCustomerFilter({ filter: { plan: testCase.filter } });

	if ("throws" in testCase.sql) {
		expect(compile).toThrow(testCase.sql.throws);
		return;
	}

	const sql = normalizeSql(compile().sql);
	for (const fragment of testCase.sql.fragments) {
		expect(sql).toContain(normalizeSql(fragment));
	}
};
