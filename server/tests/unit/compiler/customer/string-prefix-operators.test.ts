/**
 * `$startsWith` and `$regex` are part of StringMatcherSchema, so the API
 * accepts and persists filters using them, but the compiler never lowered
 * them. A migration saved with either operator stored cleanly and then threw
 * `No supported operator found` on every preview, run and count.
 *
 * Red (current):  compiling such a filter throws.
 * Green (after):  they lower to LIKE / ~ against the field's column.
 */

import { expect, test } from "bun:test";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import { contexts } from "@tests/utils/fixtures/db/contexts";

const ctx = contexts.create({ features: [] });
const ambient = { orgId: "org_test", env: "live" };

const compile = (filter: Record<string, unknown>) =>
	compileFilter({
		filter: filter as never,
		ctx: { features: ctx.features },
		ambient,
	});

test("customer_id $startsWith compiles to a prefix match", () => {
	const result = compile({ customer_id: { $startsWith: "bench-c-12" } });
	expect(result.sql).toContain("c.id LIKE ?");
	expect(result.params).toContain("bench-c-12%");
});

test("a prefix containing LIKE wildcards matches them literally", () => {
	const result = compile({ customer_id: { $startsWith: "50%_off" } });
	expect(result.params).toContain("50\\%\\_off%");
});

test("customer_id $regex compiles to a regex match", () => {
	const result = compile({ customer_id: { $regex: "^bench-c-12" } });
	expect(result.sql).toContain("c.id ~ ?");
	expect(result.params).toContain("^bench-c-12");
});

test("a prefix combines with another operator on the same field", () => {
	const result = compile({
		customer_id: { $startsWith: "bench-", $ne: "bench-c-1" },
	});
	expect(result.sql).toContain("LIKE ?");
	expect(result.sql).toContain("<> ?");
});
