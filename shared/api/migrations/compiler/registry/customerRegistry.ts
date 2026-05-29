import { RELEVANT_STATUSES } from "../../../../utils/cusProductUtils/cusProductConstants.js";
import type { NavScope, RootScope } from "./registryTypes.js";

/**
 * Phase 1 field registry, rooted at the `customers` table.
 *
 * Supported paths:
 *   plan.plan_id
 *   plan.item.feature_id, plan.item.price (existence only: null / $ne null)
 *   plan.item.rollover (existence only: null / $ne null)
 *
 * Aliases:
 *   c   customers
 *   cp  customer_products
 *   p   products
 *   ce  customer_entitlements
 *   e   entitlements
 *   pr  prices              (LEFT JOIN — only present for paid items)
 *   cpr customer_prices     (LEFT JOIN — only present for paid items)
 *
 * Item resolution: a plan item is identified by its entitlement.
 * `feature_id` ALWAYS resolves via `customer_entitlements → entitlements`.
 * The price side is reached by reversing the link: `prices.entitlement_id
 * = entitlements.id`. Customer prices are LEFT JOINed so existence checks
 * compile to `cpr.id IS NULL` / `IS NOT NULL`.
 *
 * Ambient predicates push `org_id` / `env` down into every scope whose
 * table has those columns. Without this, multi-tenant scans bloat 10x+.
 *
 * `cp.status IN RELEVANT_STATUSES` is also baked in — customer-rooted
 * filters operate on active and scheduled plan instances.
 */

/**
 * Default item scope: entitlement spine. Handles both free and paid items.
 * `price` filtering is done by LEFT JOINing prices/customer_prices and
 * checking `cpr.id IS NULL / NOT NULL`.
 */
const itemScope: NavScope = {
	from: [
		"customer_entitlements ce",
		"JOIN entitlements e ON e.id = ce.entitlement_id",
		"LEFT JOIN prices pr ON pr.entitlement_id = e.id",
		"LEFT JOIN customer_prices cpr ON cpr.price_id = pr.id AND cpr.customer_product_id = ce.customer_product_id",
	].join(" "),
	correlation: "ce.customer_product_id = cp.id",
	fields: {
		feature_id: { kind: "leaf", sql: "e.internal_feature_id" },
		price: { kind: "leaf", sql: "cpr.id" },
		rollover: { kind: "leaf", sql: "e.rollover" },
	},
};

/**
 * Paid-only optimization: when the filter requires a non-null price, walk
 * customer_prices forward instead of the entitlement spine. Skips every
 * free entitlement row entirely — typically ~10x fewer rows scanned.
 *
 * Selected by the parser when it sees `price: { $ne: null }`.
 */
const itemPaidScope: NavScope = {
	from: [
		"customer_prices cpr",
		"JOIN prices pr ON pr.id = cpr.price_id",
		"JOIN entitlements e ON e.id = pr.entitlement_id",
	].join(" "),
	correlation: "cpr.customer_product_id = cp.id",
	fields: {
		feature_id: { kind: "leaf", sql: "e.internal_feature_id" },
		// `cpr.id` is the driving column — always non-null in this scope.
		// Emitting `cpr.id IS NOT NULL` is redundant but harmless; Postgres
		// elides it.
		price: { kind: "leaf", sql: "cpr.id" },
		rollover: { kind: "leaf", sql: "e.rollover" },
	},
};

const planScope: NavScope = {
	from: "customer_products cp JOIN products p ON p.internal_id = cp.internal_product_id",
	correlation: "cp.internal_customer_id = c.internal_id",
	ambient: [
		{
			column: "cp.status",
			source: { kind: "values", values: RELEVANT_STATUSES },
		},
	],
	fields: {
		plan_id: { kind: "leaf", sql: "p.id" },
		version: { kind: "leaf", sql: "p.version" },
		addon: { kind: "leaf", sql: "p.is_add_on" },
		custom: { kind: "leaf", sql: "cp.is_custom" },
		// Base price existence: a leaf whose SQL is a scalar subquery that
		// evaluates to NULL when the customer has no base customer_price on
		// this cusproduct, non-NULL otherwise. The `exists` op (compiled
		// via `IS NULL` / `IS NOT NULL`) works against this exactly the
		// same way it works against `cpr.id` inside `itemScope` — the leaf
		// abstraction unifies "existence-of-related-row" semantics across
		// any scope that needs them.
		price: {
			kind: "leaf",
			sql: [
				"(SELECT base_cpr.id FROM customer_prices base_cpr",
				"JOIN prices base_pr ON base_pr.id = base_cpr.price_id",
				"WHERE base_cpr.customer_product_id = cp.id",
				"AND base_pr.entitlement_id IS NULL LIMIT 1)",
			].join(" "),
		},
		// Derived boolean filters: SQL is a boolean EXISTS expression so
		// `paid: true` compiles to `EXISTS(...) = true` (Postgres treats
		// this as the same as `EXISTS(...)`). See SKILL.md "Derived
		// boolean filters" for the pattern.
		paid: {
			kind: "leaf",
			sql: "EXISTS (SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id)",
		},
		recurring: {
			kind: "leaf",
			sql: [
				"EXISTS (SELECT 1 FROM customer_prices cpr",
				"JOIN prices pr ON pr.id = cpr.price_id",
				"WHERE cpr.customer_product_id = cp.id",
				"AND pr.config->>'interval' <> 'one_off')",
			].join(" "),
		},
		item: { kind: "nav", scope: itemScope },
		item_paid: { kind: "nav", scope: itemPaidScope },
	},
};

export const customerRegistry: RootScope = {
	from: "customers c",
	ambient: [
		{ column: "c.org_id", source: { kind: "context", key: "orgId" } },
		{ column: "c.env", source: { kind: "context", key: "env" } },
	],
	fields: {
		customer_id: { kind: "leaf", sql: "c.id" },
		plan: { kind: "nav", scope: planScope },
	},
};
