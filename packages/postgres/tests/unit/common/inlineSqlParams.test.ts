import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { inlineSqlParams } from "../../../src/common/inlineSqlParams.js";

describe("inlineSqlParams", () => {
	test("each value becomes a literal typed as Bun.sql binds it", () => {
		expect(
			inlineSqlParams({
				statement: sql`SELECT ${5}, ${-3}, ${2 ** 40}, ${0.5}, ${7n}, ${true}, ${null}, ${"x"}`,
			}),
		).toBe(
			"SELECT '5'::int4, '-3'::int4, '1099511627776'::int8, '0.5'::float8, '7'::int8, true, NULL, E'x'",
		);
	});

	test("quotes and backslashes are escaped, and placeholders inside quoted text are left alone", () => {
		expect(
			inlineSqlParams({
				statement: sql`SELECT '$1 it''s', "c$2", ${"o'q\\$1"}`,
			}),
		).toBe(`SELECT '$1 it''s', "c$2", E'o''q\\\\$1'`);
	});

	test("a value with no faithful literal leaves the statement bound", () => {
		expect(inlineSqlParams({ statement: sql`SELECT ${new Date(0)}` })).toBe(
			null,
		);
		expect(inlineSqlParams({ statement: sql`SELECT ${"nul\0"}` })).toBe(null);
	});
});
