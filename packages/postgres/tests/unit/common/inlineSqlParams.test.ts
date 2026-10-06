import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { inlineSqlParams } from "../../../src/common/inlineSqlParams.js";

describe("inlineSqlParams", () => {
	test("each value becomes the untyped text literal pg binds it as", () => {
		expect(
			inlineSqlParams({
				statement: sql`SELECT ${5}, ${-3}, ${2 ** 40}, ${0.5}, ${7n}, ${true}, ${null}, ${"x"}`,
			}),
		).toBe(
			"SELECT E'5', E'-3', E'1099511627776', E'0.5', E'7', E'true', NULL, E'x'",
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
