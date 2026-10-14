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

test("customer_id $startsWith compiles to an index-usable range", () => {
	const result = compile({ customer_id: { $startsWith: "bench-c-12" } });
	expect(result.sql).toContain("c.id >= ?");
	expect(result.sql).toContain('c.id COLLATE "C" < ?');
	expect(result.params).toContain("bench-c-12");
	expect(result.params).toContain("bench-c-13");
});

test("the range seeks in the index collation and rechecks byte order", () => {
	const result = compile({ customer_id: { $startsWith: "ab" } });
	expect(result.sql).toContain("c.id >= ?");
	expect(result.sql).toContain("c.id < ?");
	expect((result.sql.match(/COLLATE "C"/g) ?? []).length).toBe(2);
	expect(result.params.filter((p) => p === "ab")).toHaveLength(2);
	expect(result.params.filter((p) => p === "ac")).toHaveLength(2);
});

test("a prefix ending at the maximum code point leaves the range open", () => {
	const maxChar = String.fromCodePoint(0x10ffff);
	const result = compile({ customer_id: { $startsWith: maxChar } });
	expect(result.sql).toContain("c.id >= ?");
	expect(result.sql).not.toContain("< ?");
	expect(result.params).toContain(maxChar);
});

test("wildcard characters in a prefix are matched literally", () => {
	const result = compile({ customer_id: { $startsWith: "50%_off" } });
	expect(result.params).toContain("50%_off");
	expect(result.params).toContain("50%_ofg");
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
	expect(result.sql).toContain("c.id >= ?");
	expect(result.sql).toContain("<> ?");
});
