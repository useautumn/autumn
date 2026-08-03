import { describe, expect, test } from "bun:test";
import type { Feature } from "@autumn/shared";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import {
	type CustomerPagePredicate,
	composeCustomerCount,
	composeCustomerPage,
} from "@autumn/shared/api/migrations/filters/planner/composeCustomerPage.js";
import {
	composeCustomerPreviewCount,
	composeCustomerPreviewPage,
} from "@autumn/shared/api/migrations/filters/planner/composeCustomerPreview.js";
import { contexts } from "@tests/utils/fixtures/db/contexts";

const features: Feature[] = [
	{ id: "credits", internal_id: "fea_credits_internal" } as Feature,
];

const ctx = contexts.create({ features });
const ambient = { orgId: "org_test", env: "live" };
const RELEVANT_STATUS_PARAMS = ["active", "past_due", "scheduled"];

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

const compose = ({
	filter,
	cursor,
	predicates,
}: {
	filter: CustomerFilter;
	cursor?: string;
	predicates?: CustomerPagePredicate[];
}) =>
	composeCustomerPage({
		filter,
		ctx: { features: ctx.features },
		ambient,
		limit: 5000,
		cursor,
		predicates,
	});

/** The lateral walk section (between CROSS JOIN LATERAL and `) walk`). */
const walkSection = (sql: string) => {
	const normalized = normalize(sql);
	const start = normalized.indexOf("CROSS JOIN LATERAL");
	const end = normalized.indexOf(") walk ORDER BY");
	expect(start).toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	return normalized.slice(start, end);
};

const checkpointPredicate: CustomerPagePredicate = {
	build: (keyColumn) => ({
		sql: `NOT EXISTS (SELECT 1 FROM migration_item_runs mir WHERE mir.item_id = ${keyColumn})`,
		params: [],
	}),
};

describe("composeCustomerPage", () => {
	test("consumed plan filter drives a pure cp walk — no customers join inside", () => {
		const page = compose({
			filter: { plan: { plan_id: "enterprise" } },
			cursor: "cus_after",
			predicates: [checkpointPredicate],
		});
		const walk = walkSection(page.sql);

		// Everything filters INSIDE the walk, so LIMIT counts matches.
		expect(walk).toContain('cp.internal_customer_id COLLATE "C" < ?');
		expect(walk).toContain("mir.item_id = cp.internal_customer_id");
		expect(walk).toContain("LIMIT ?");
		expect(walk).not.toContain("JOIN customers");
		expect(normalize(page.sql)).toContain(
			"JOIN customers c ON c.internal_id = m.internal_customer_id",
		);
		expect(page.params).toEqual([
			"org_test",
			"live",
			"enterprise",
			...RELEVANT_STATUS_PARAMS,
			"cus_after",
			5000,
			5000,
			"org_test",
			"live",
		]);
	});

	test("consumed extras (custom/version) filter inside the walk", () => {
		const page = compose({
			filter: { plan: { plan_id: "enterprise", version: 2, custom: false } },
		});
		const normalized = normalize(page.sql);
		const walk = walkSection(page.sql);

		expect(normalized).toContain("AND p.id = ? AND p.version = ?");
		expect(walk).toContain("cp.is_custom = ?");
		expect(walk).not.toContain("JOIN customers");
	});

	test("non-consumable residual joins customers inside the walk and filters pre-limit", () => {
		const page = compose({
			filter: {
				plan: { plan_id: "enterprise", item: { feature_id: "credits" } },
			},
		});
		const walk = walkSection(page.sql);

		expect(walk).toContain(
			"JOIN customers c ON c.internal_id = cp.internal_customer_id",
		);
		// The full quantifier re-proof (EXISTS over the entitlement spine) sits
		// inside the walk, BEFORE its ORDER BY/LIMIT — pages stay exact.
		expect(walk).toContain("customer_entitlements ce");
		const limitIndex = walk.indexOf("LIMIT ?");
		const residualIndex = walk.indexOf("customer_entitlements ce");
		expect(residualIndex).toBeGreaterThan(-1);
		expect(residualIndex).toBeLessThan(limitIndex);
	});

	test("consumed derived extras (paid/recurring/price) filter inside the walk without a customers join", () => {
		const page = compose({
			filter: {
				plan: {
					plan_id: "enterprise",
					paid: true,
					recurring: true,
					price: { $ne: null },
				},
			},
		});
		const walk = walkSection(page.sql);

		expect(walk).not.toContain("JOIN customers c");
		expect(walk).toContain(
			"EXISTS (SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id) = ?",
		);
		expect(walk).toContain("pr.config->>'interval' <> 'one_off') = ?");
		expect(walk).toContain(
			"AND base_pr.entitlement_id IS NULL LIMIT 1) IS NOT NULL",
		);
	});

	test("consumed price: null renders IS NULL inside the walk", () => {
		const page = compose({
			filter: { plan: { plan_id: "enterprise", price: null } },
		});
		const walk = walkSection(page.sql);

		expect(walk).not.toContain("JOIN customers c");
		expect(walk).toContain(
			"AND base_pr.entitlement_id IS NULL LIMIT 1) IS NULL",
		);
	});

	test("customer-level residual filters inside the walk", () => {
		const page = compose({
			filter: { customer_id: "cus_123", plan: { plan_id: "enterprise" } },
		});
		const walk = walkSection(page.sql);

		expect(walk).toContain("JOIN customers c");
		expect(walk).toContain("c.id = ?");
	});

	test("needsCustomerAlias predicate forces the walk customers join", () => {
		const page = compose({
			filter: { plan: { plan_id: "enterprise" } },
			predicates: [
				{
					needsCustomerAlias: true,
					build: () => ({ sql: "c.name ILIKE ?", params: ["%acme%"] }),
				},
			],
		});
		const walk = walkSection(page.sql);

		expect(walk).toContain("JOIN customers c");
		expect(walk).toContain("c.name ILIKE ?");
	});

	test("filters without a plan access path walk customers directly", () => {
		const page = compose({
			filter: { customer_id: "cus_123" },
			cursor: "cus_after",
			predicates: [checkpointPredicate],
		});
		const normalized = normalize(page.sql);

		expect(normalized).not.toContain("CROSS JOIN LATERAL");
		expect(normalized).toContain("FROM customers c");
		expect(normalized).toContain("AND c.internal_id < ?");
		expect(normalized).toContain("mir.item_id = c.internal_id");
		expect(normalized).toContain("ORDER BY c.internal_id DESC LIMIT ?");
		expect(page.params).toEqual([
			"org_test",
			"live",
			"cus_123",
			"cus_after",
			5000,
			"org_test",
			"live",
		]);
	});

	test("count: plan-level-only filters count off customer_products alone", () => {
		const count = composeCustomerCount({
			filter: { plan: { plan_id: "enterprise", custom: false } },
			ctx: { features: ctx.features },
			ambient,
			predicates: [checkpointPredicate],
		});

		const normalized = normalize(count.sql);
		expect(normalized).toContain("FROM customer_products cp");
		expect(normalized).toContain("cp.is_custom = ?");
		expect(normalized).toContain("mir.item_id = cp.internal_customer_id");
		expect(normalized).toContain("GROUP BY cp.internal_customer_id");
		expect(normalized).not.toContain("JOIN customers");
		expect(normalized).not.toContain("FROM customers");
	});

	test("count: derived plan filters count off customer_products alone", () => {
		const count = composeCustomerCount({
			filter: { plan: { plan_id: "enterprise", recurring: true } },
			ctx: { features: ctx.features },
			ambient,
		});

		const normalized = normalize(count.sql);
		expect(normalized).toContain("FROM customer_products cp");
		expect(normalized).toContain("pr.config->>'interval' <> 'one_off') = ?");
		expect(normalized).toContain("GROUP BY cp.internal_customer_id");
		expect(normalized).not.toContain("JOIN customers");
		expect(normalized).not.toContain("FROM customers");
	});

	test("count: residuals and customer-row predicates take the batch-hash path", () => {
		const withResidual = composeCustomerCount({
			filter: {
				plan: { plan_id: "enterprise", item: { feature_id: "credits" } },
			},
			ctx: { features: ctx.features },
			ambient,
		});
		expect(normalize(withResidual.sql)).toContain(
			"WITH plan_products AS MATERIALIZED",
		);
		expect(normalize(withResidual.sql)).toContain("customer_entitlements ce");

		const withCustomerPredicate = composeCustomerCount({
			filter: { plan: { plan_id: "enterprise" } },
			ctx: { features: ctx.features },
			ambient,
			predicates: [
				{
					needsCustomerAlias: true,
					build: () => ({ sql: "c.name ILIKE ?", params: ["%x%"] }),
				},
			],
		});
		expect(normalize(withCustomerPredicate.sql)).toContain(
			"WITH plan_products AS MATERIALIZED",
		);
		expect(normalize(withCustomerPredicate.sql)).toContain("c.name ILIKE ?");

		const fallbackFilter = composeCustomerCount({
			filter: { customer_id: "cus_123" },
			ctx: { features: ctx.features },
			ambient,
		});
		expect(normalize(fallbackFilter.sql)).toContain("FROM customers c");
		expect(normalize(fallbackFilter.sql)).toContain("COUNT(*)");
	});

	test("preview page: filter walk UNION bounded mir walk, deduped and re-limited", () => {
		const page = composeCustomerPreviewPage({
			filter: { plan: { plan_id: "enterprise" } },
			ctx: { features: ctx.features },
			ambient,
			processed: { migrationInternalId: "mig_1" },
			limit: 51,
			cursor: "cus_after",
		});
		const normalized = normalize(page.sql);

		// Branch A: the same bounded filter walk the page query uses.
		expect(normalized).toContain("CROSS JOIN LATERAL");
		// Branch B: bounded mir walk in customer order, cursor inside.
		expect(normalized).toContain(
			'DISTINCT ON (mir.item_id COLLATE "C") mir.item_id',
		);
		expect(normalized).toContain('mir.item_id COLLATE "C" < ?');
		expect(normalized).toContain("UNION");
		// The union is re-limited, then joined for payload columns.
		expect(normalized).toContain(
			') u ORDER BY internal_customer_id COLLATE "C" DESC LIMIT ?',
		);
		expect(normalized).toContain(
			"JOIN customers c ON c.internal_id = m.internal_customer_id",
		);
	});

	test("preview count: distinct union of the two id sets, no customers table", () => {
		const count = composeCustomerPreviewCount({
			filter: { plan: { plan_id: "enterprise" } },
			ctx: { features: ctx.features },
			ambient,
			processed: { migrationInternalId: "mig_1" },
		});
		const normalized = normalize(count.sql);

		expect(normalized).toContain("GROUP BY cp.internal_customer_id");
		expect(normalized).toContain("FROM migration_item_runs mir");
		expect(normalized).toContain("UNION");
		expect(normalized).toContain("COUNT(*)");
		expect(normalized).not.toContain("customers");
	});

	test("negative plan quantifiers stay on the customers driver with the full filter", () => {
		const page = compose({
			filter: { plan: { $none: { plan_id: "enterprise" } } },
		});
		const normalized = normalize(page.sql);

		expect(normalized).not.toContain("CROSS JOIN LATERAL");
		expect(normalized).toContain("FROM customers c");
		expect(normalized).toContain("NOT EXISTS");
	});
});
