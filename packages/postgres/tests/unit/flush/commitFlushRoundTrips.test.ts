import { describe, expect, test } from "bun:test";
import {
	commitFlush,
	FlushBookmarkConflictError,
} from "../../../src/flush/repos/commitFlush.js";
import type { FlushRequest } from "../../../src/flush/types/flush.js";

const request: FlushRequest = {
	changes: [
		{
			op: "update",
			table: "customerEntitlements",
			id: "ce_1",
			set: {},
			add: { balance: -5 },
			addEntries: {},
			guard: {},
		},
		{
			op: "update",
			table: "customerEntitlements",
			id: "ce_2",
			set: {},
			add: { balance: 1 },
			addEntries: {},
			guard: {},
		},
	],
	bookmarks: [
		{ topic: "metering", partition: 3, expectedOffset: 40n, nextOffset: 42n },
	],
};

/** Bun's server error for the rollback cast, as Postgres words it. */
const castError = (text: string) =>
	Object.assign(new Error(`invalid input syntax for type integer: "${text}"`), {
		errno: "22P02",
		code: "ERR_POSTGRES_SERVER_ERROR",
	});

const single = ({ execute }: { execute: () => Promise<unknown[]> }) =>
	commitFlush({
		ctx: {
			db: {
				execute,
				transaction: () => {
					throw new Error("the single-statement flush opened a transaction");
				},
			} as never,
		},
		request,
		statementTimeoutMs: 2_000,
		roundTrips: "single",
	});

describe("commitFlush with roundTrips single", () => {
	test("sends exactly one statement and no transaction", async () => {
		let statements = 0;
		const result = await single({
			execute: async () => {
				statements++;
				return [{ applied: [1, 1], bookmarks: 1 }];
			},
		});
		expect(statements).toBe(1);
		expect(result).toEqual({ applied: [true, true] });
	});

	test("a bookmark that did not move is a conflict, as in the transaction", async () => {
		await expect(
			single({
				execute: async () => {
					throw castError("flush_rolled_back:0:1,1");
				},
			}),
		).rejects.toBeInstanceOf(FlushBookmarkConflictError);
	});

	test("a row that did not land names itself from the aborted counts", async () => {
		const result = await single({
			execute: async () => {
				throw castError("flush_rolled_back:1:1,0");
			},
		});
		expect(result).toEqual({ applied: [true, false] });
	});

	test("any other Postgres error comes out unchanged", async () => {
		const unique = Object.assign(new Error("duplicate key"), {
			errno: "23505",
		});
		await expect(
			single({
				execute: async () => {
					throw unique;
				},
			}),
		).rejects.toBe(unique);
	});
});
