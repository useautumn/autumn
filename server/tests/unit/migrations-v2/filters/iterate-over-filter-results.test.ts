import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { iterateOverFilterResults } from "@/internal/migrations/v2/filters/iterateOverFilterResults.js";

test("filter iteration resumes after a cross-task customer cursor", async () => {
	const cursors: Array<string | undefined> = [];
	const responses = [
		[{ internal_id: "customer_101" }, { internal_id: "customer_102" }],
		[{ internal_id: "customer_103" }],
	];
	const rows: string[] = [];

	const source = iterateOverFilterResults({
		db: {
			execute: async () => responses.shift() ?? [],
		},
		buildSelect: ({ afterInternalId }) => {
			cursors.push(afterInternalId);
			return sql`select 1`;
		},
		batchSize: 2,
		afterInternalId: "customer_100",
	});

	for await (const batch of source) {
		rows.push(...batch.map((row) => row.internal_id));
	}

	expect(cursors).toEqual(["customer_100", "customer_102"]);
	expect(rows).toEqual(["customer_101", "customer_102", "customer_103"]);
});
