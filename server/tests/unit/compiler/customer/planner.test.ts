import { describe, expect, test } from "bun:test";
import type { Feature } from "@autumn/shared";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import { buildCustomerCandidateQuery } from "@autumn/shared/api/migrations/filters/planner/buildCustomerCandidateQuery.js";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { contexts } from "@tests/utils/fixtures/db/contexts";

const features: Feature[] = [
	{ id: "credits", internal_id: "fea_credits_internal" } as Feature,
];

const ctx = contexts.create({ features });
const ambient = { orgId: "org_test", env: "live" };
const RELEVANT_STATUS_PARAMS = ["active", "past_due", "scheduled"];

/** Residual WHERE once the source consumed the whole plan quantifier. */
const AMBIENT_ONLY_WHERE = "c.org_id = ? AND c.env = ? AND TRUE";

const normalize = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

const buildCandidate = (filter: CustomerFilter) =>
	buildCustomerCandidateQuery({
		filter,
		ctx: { features: ctx.features },
		ambient,
	});

/** Unconsumed paths must keep the exact fallback WHERE (source is narrowing
 * only, the WHERE re-proves everything). */
const expectFallbackWhereParity = (filter: CustomerFilter) => {
	const candidate = buildCandidate(filter);
	const fallback = compileFilter({
		filter,
		ctx: { features: ctx.features },
		ambient,
	});

	expect(normalize(candidate.where.sql)).toBe(normalize(fallback.sql));
	expect(candidate.where.params).toEqual(fallback.params);
	return candidate;
};

describe("customer filter planner", () => {
	test("plan.plan_id eq consumes the quantifier into the source", () => {
		const candidate = buildCandidate({ plan: { plan_id: "enterprise" } });

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: true,
		});
		expect(normalize(candidate.source.sql)).toBe(
			normalize(`
				(WITH plan_products AS MATERIALIZED (
				SELECT p.internal_id FROM products p
				WHERE p.org_id = ? AND p.env = ?
				AND p.id = ?
				) SELECT DISTINCT c.internal_id, c.id, c.name, c.email, c.org_id, c.env
				FROM plan_products pp
				JOIN customer_products cp ON cp.internal_product_id = pp.internal_id
				JOIN customers c ON c.internal_id = cp.internal_customer_id
				WHERE cp.status IN (?, ?, ?)
					AND c.org_id = ?
					AND c.env = ?) c
			`),
		);
		expect(candidate.source.params).toEqual([
			"org_test",
			"live",
			"enterprise",
			...RELEVANT_STATUS_PARAMS,
			"org_test",
			"live",
		]);
		expect(normalize(candidate.where.sql)).toBe(AMBIENT_ONLY_WHERE);
		expect(candidate.where.params).toEqual(["org_test", "live"]);
	});

	test("plan.plan_id in consumes via the same candidate path", () => {
		const candidate = buildCandidate({
			plan: { plan_id: { $in: ["enterprise", "pro"] } },
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: true,
		});
		expect(normalize(candidate.source.sql)).toContain("p.id IN (?, ?)");
		expect(candidate.source.params).toEqual([
			"org_test",
			"live",
			"enterprise",
			"pro",
			...RELEVANT_STATUS_PARAMS,
			"org_test",
			"live",
		]);
		expect(normalize(candidate.where.sql)).toBe(AMBIENT_ONLY_WHERE);
	});

	test("plan_id + version consumes version into the products CTE", () => {
		const candidate = buildCandidate({
			plan: { plan_id: "enterprise", version: 2 },
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: true,
		});
		expect(normalize(candidate.source.sql)).toContain(
			"AND p.id = ? AND p.version = ?",
		);
		expect(candidate.source.params).toEqual([
			"org_test",
			"live",
			"enterprise",
			2,
			...RELEVANT_STATUS_PARAMS,
			"org_test",
			"live",
		]);
		expect(normalize(candidate.where.sql)).toBe(AMBIENT_ONLY_WHERE);
	});

	test("plan_id + custom consumes is_custom onto the cp join", () => {
		const candidate = buildCandidate({
			plan: { plan_id: "enterprise", custom: false },
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: true,
		});
		expect(normalize(candidate.source.sql)).toContain(
			"WHERE cp.status IN (?, ?, ?) AND cp.is_custom = ?",
		);
		expect(candidate.source.params).toEqual([
			"org_test",
			"live",
			"enterprise",
			...RELEVANT_STATUS_PARAMS,
			false,
			"org_test",
			"live",
		]);
		expect(normalize(candidate.where.sql)).toBe(AMBIENT_ONLY_WHERE);
	});

	test("plan_id + version + addon + custom consumes all simple leaves", () => {
		const candidate = buildCandidate({
			plan: { plan_id: "enterprise", version: 2, addon: false, custom: false },
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: true,
		});
		expect(normalize(candidate.source.sql)).toContain(
			"AND p.id = ? AND p.version = ? AND p.is_add_on = ?",
		);
		expect(normalize(candidate.source.sql)).toContain(
			"WHERE cp.status IN (?, ?, ?) AND cp.is_custom = ?",
		);
		expect(candidate.source.params).toEqual([
			"org_test",
			"live",
			"enterprise",
			2,
			false,
			...RELEVANT_STATUS_PARAMS,
			false,
			"org_test",
			"live",
		]);
		expect(normalize(candidate.where.sql)).toBe(AMBIENT_ONLY_WHERE);
	});

	test("consumed plan quantifier keeps sibling customer predicates residual", () => {
		const candidate = buildCandidate({
			customer_id: "cus_123",
			plan: { plan_id: "enterprise" },
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: true,
		});
		expect(normalize(candidate.where.sql)).toBe(
			"c.org_id = ? AND c.env = ? AND (c.id = ?)",
		);
		expect(candidate.where.params).toEqual(["org_test", "live", "cus_123"]);
		expect(normalize(candidate.where.sql)).not.toContain("customer_products");
	});

	test("non-consumable version op keeps the full fallback WHERE", () => {
		const candidate = expectFallbackWhereParity({
			plan: { plan_id: "enterprise", version: { $gte: 2 } },
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: false,
		});
		expect(normalize(candidate.source.sql)).not.toContain("p.version");
	});

	test("compound filters use plan_id as a candidate and keep fallback semantics", () => {
		const candidate = expectFallbackWhereParity({
			plan: {
				plan_id: "enterprise",
				item: { feature_id: "credits" },
			},
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: false,
		});
		expect(normalize(candidate.source.sql)).toContain("p.id = ?");
		expect(normalize(candidate.where.sql)).toContain("e.internal_feature_id = ?");
	});

	test("plan_id + price keeps base-price existence as a residual predicate", () => {
		const candidate = expectFallbackWhereParity({
			plan: {
				plan_id: "enterprise",
				price: { $ne: null },
			},
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: false,
		});
		expect(normalize(candidate.source.sql)).not.toContain("base_cpr.id");
		expect(normalize(candidate.where.sql)).toContain("base_cpr.id");
		expect(normalize(candidate.where.sql)).toContain("IS NOT NULL");
	});

	test("plan_id + paid/recurring derived filters remain residual predicates", () => {
		const candidate = expectFallbackWhereParity({
			plan: {
				plan_id: "enterprise",
				paid: true,
				recurring: true,
			},
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: false,
		});
		expect(normalize(candidate.source.sql)).not.toContain("customer_prices");
		expect(normalize(candidate.where.sql)).toContain("customer_prices cpr");
		expect(normalize(candidate.where.sql)).toContain(
			"pr.config->>'interval' <> 'one_off'",
		);
	});

	test("plan_id + item rollover keeps entitlement rollover as a residual predicate", () => {
		const candidate = expectFallbackWhereParity({
			plan: {
				plan_id: "enterprise",
				item: { rollover: { $ne: null } },
			},
		});

		expect(candidate.accessPath).toEqual({
			kind: "planned",
			id: "plan.plan_id",
			consumed: false,
		});
		expect(normalize(candidate.source.sql)).not.toContain("e.rollover");
		expect(normalize(candidate.where.sql)).toContain("e.rollover IS NOT NULL");
	});

	test("top-level item rollover falls back until an entitlement access path exists", () => {
		const candidate = expectFallbackWhereParity({
			item: { rollover: { $ne: null } },
		});

		expect(candidate.accessPath).toEqual({ kind: "fallback" });
		expect(normalize(candidate.source.sql)).toBe("customers c");
		expect(normalize(candidate.where.sql)).toContain("e.rollover IS NOT NULL");
	});

	test("plan_id inside an OR falls back to avoid dropping other branches", () => {
		const candidate = expectFallbackWhereParity({
			plan: {
				$or: [{ plan_id: "enterprise" }, { paid: true }],
			},
		});

		expect(candidate.accessPath).toEqual({ kind: "fallback" });
		expect(normalize(candidate.source.sql)).toBe("customers c");
	});

	test("negative plan quantifiers fall back", () => {
		const candidate = expectFallbackWhereParity({
			plan: { $none: { plan_id: "enterprise" } },
		});

		expect(candidate.accessPath).toEqual({ kind: "fallback" });
		expect(normalize(candidate.source.sql)).toBe("customers c");
	});

	test("direct customer filters remain customer-rooted", () => {
		const candidate = expectFallbackWhereParity({
			customer_id: "cus_123",
		});

		expect(candidate.accessPath).toEqual({ kind: "fallback" });
		expect(normalize(candidate.source.sql)).toBe("customers c");
	});
});
