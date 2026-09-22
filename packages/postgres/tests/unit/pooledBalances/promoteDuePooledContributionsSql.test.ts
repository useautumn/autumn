import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { promoteDuePooledContributionsSql } from "../../../src/pooledBalances/repos/promoteDuePooledContributions.js";

const dialect = new PgDialect();

describe("promoteDuePooledContributionsSql", () => {
	test("promotes due rows and sums the pool at promoted values in one statement", () => {
		const query = dialect.sqlToQuery(
			promoteDuePooledContributionsSql({
				pooledBalanceId: "pb_1",
				now: 1_700_000_000_000,
			}),
		);
		expect(query.params).toEqual([
			1_700_000_000_000,
			"pb_1",
			1_700_000_000_000,
			1_700_000_000_000,
			"pb_1",
		]);
		expect(query.sql).toContain(
			"SET current_contribution = next_cycle_contribution",
		);
		expect(query.sql).toContain("THEN next_cycle_contribution");
		expect(query.sql).toContain("COUNT(*)::int AS total_count");
	});
});
