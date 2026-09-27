import { describe, expect, test } from "bun:test";
import { queryApl } from "../../../src/query/queryApl";
import type { AxiomClient } from "../../../src/types/axiomClient";

const tabularTable = (rows: Record<string, unknown>[]) => ({
	name: "0",
	events: function* () {
		yield* rows;
	},
});

const fakeAxiom = ({
	tables,
	calls,
}: {
	tables: ReturnType<typeof tabularTable>[];
	calls: unknown[][];
}): AxiomClient =>
	({
		api: {
			query: async (...args: unknown[]) => {
				calls.push(args);
				return { tables };
			},
		},
	}) as unknown as AxiomClient;

describe("queryApl", () => {
	test("asks for tabular results and flattens every table into rows", async () => {
		const calls: unknown[][] = [];
		const axiom = fakeAxiom({
			tables: [
				tabularTable([{ org_id: "org_1", requests: 3 }]),
				tabularTable([{ org_id: "org_2", requests: 5 }]),
			],
			calls,
		});

		const rows = await queryApl({
			ctx: { axiom },
			query: {
				apl: "['express'] | count",
				startTime: "2026-09-27T09:00:00Z",
				endTime: "2026-09-27T12:00:00Z",
			},
		});

		expect(rows).toEqual([
			{ org_id: "org_1", requests: 3 },
			{ org_id: "org_2", requests: 5 },
		]);
		expect(calls).toEqual([
			[
				"['express'] | count",
				{
					startTime: "2026-09-27T09:00:00Z",
					endTime: "2026-09-27T12:00:00Z",
					format: "tabular",
				},
			],
		]);
	});

	test("no tables → no rows", async () => {
		const axiom = fakeAxiom({ tables: [], calls: [] });
		expect(
			await queryApl({ ctx: { axiom }, query: { apl: "['express'] | count" } }),
		).toEqual([]);
	});
});
