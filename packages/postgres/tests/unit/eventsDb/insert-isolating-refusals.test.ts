import { describe, expect, test } from "bun:test";
import { AppEnv, type EventInsert } from "@autumn/shared";
import {
	insertIsolatingRefusals,
	type UsageEventsInsertResult,
} from "../../../src/eventsDb/repos/usageEvents.js";

const eventOf = ({ id }: { id: string }): EventInsert => ({
	id,
	org_id: "org",
	org_slug: "org",
	env: AppEnv.Sandbox,
	customer_id: "cus",
	event_name: "messages",
	value: 1,
});

/** One statement: refuses the whole lot when it holds a bad row, the way Postgres does. */
const statementRefusing = ({ badIds }: { badIds: string[] }) => {
	const statements: string[][] = [];
	const insertRows = async (rows: EventInsert[]): Promise<string[]> => {
		statements.push(rows.map((row) => row.id));
		if (rows.some((row) => badIds.includes(row.id)))
			throw Object.assign(new Error("value out of range"), { errno: "22003" });
		return rows.map((row) => row.id);
	};
	return { insertRows, statements };
};

const run = async ({ ids, badIds }: { ids: string[]; badIds: string[] }) => {
	const { insertRows, statements } = statementRefusing({ badIds });
	const result: UsageEventsInsertResult = { insertedIds: [], refused: [] };
	await insertIsolatingRefusals({
		insertRows,
		rows: ids.map((id) => eventOf({ id })),
		result,
	});
	return { result, statements };
};

describe("insertIsolatingRefusals", () => {
	test("a clean batch is one statement", async () => {
		const { result, statements } = await run({
			ids: ["a", "b", "c", "d"],
			badIds: [],
		});
		expect(statements).toHaveLength(1);
		expect(result.insertedIds).toEqual(["a", "b", "c", "d"]);
		expect(result.refused).toEqual([]);
	});

	test("one bad row is set aside and every other row still lands", async () => {
		const { result } = await run({
			ids: ["a", "b", "bad", "d", "e"],
			badIds: ["bad"],
		});
		expect(result.insertedIds.sort()).toEqual(["a", "b", "d", "e"]);
		expect(result.refused.map(({ event }) => event.id)).toEqual(["bad"]);
	});

	test("several bad rows are each set aside", async () => {
		const { result } = await run({
			ids: ["bad1", "a", "bad2", "b"],
			badIds: ["bad1", "bad2"],
		});
		expect(result.insertedIds.sort()).toEqual(["a", "b"]);
		expect(result.refused.map(({ event }) => event.id).sort()).toEqual([
			"bad1",
			"bad2",
		]);
	});

	test("a failure that is not the row's fault stops the batch so it is tried again", async () => {
		const result: UsageEventsInsertResult = { insertedIds: [], refused: [] };
		const dropped = Object.assign(new Error("connection reset"), {
			code: "ECONNRESET",
		});
		await expect(
			insertIsolatingRefusals({
				insertRows: async () => {
					throw dropped;
				},
				rows: [eventOf({ id: "a" }), eventOf({ id: "b" })],
				result,
			}),
		).rejects.toBe(dropped);
		expect(result).toEqual({ insertedIds: [], refused: [] });
	});
});
