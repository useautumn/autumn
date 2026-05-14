import { describe, expect, test } from "bun:test";
import { compilePlanFilter } from "@autumn/shared/api/migrations/compiler/compilePlanFilter.js";
import { contexts } from "@tests/utils/fixtures/db/contexts";

const ctx = contexts.create({ features: [] });
const ambient = { orgId: "org_test", env: "live" };

const PLAN_AMBIENT = "p.org_id = ? AND p.env = ?";

const normalize = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

describe("compilePlanFilter — basic plan-rooted filters", () => {
	test("plan_id eq", () => {
		const result = compilePlanFilter({
			filter: { plan_id: "pro" },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`${PLAN_AMBIENT} AND p.id = ?`),
		);
		expect(result.params).toEqual(["org_test", "live", "pro"]);
	});

	test("plan_id $in", () => {
		const result = compilePlanFilter({
			filter: { plan_id: { $in: ["pro", "team"] } },
			ctx: { features: ctx.features },
			ambient,
		});

		expect(normalize(result.sql)).toBe(
			normalize(`${PLAN_AMBIENT} AND p.id IN (?, ?)`),
		);
		expect(result.params).toEqual(["org_test", "live", "pro", "team"]);
	});
});
