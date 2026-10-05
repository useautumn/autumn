import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
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

const dialect = new PgDialect();

/** The marker this flush's statement casts on abort, nonce included: only Postgres's echo of it is a rollback. */
const markerOf = (query: SQL): string => {
	const marker = /E'(flush_rolled_back:[0-9a-f]+:)'/.exec(
		dialect.sqlToQuery(query).sql,
	)?.[1];
	if (!marker) throw new Error("the statement carries no rollback marker");
	return marker;
};

const single = ({ execute }: { execute: (query: SQL) => Promise<unknown[]> }) =>
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
				execute: async (query) => {
					throw castError(`${markerOf(query)}0:1,1`);
				},
			}),
		).rejects.toBeInstanceOf(FlushBookmarkConflictError);
	});

	test("a row that did not land names itself from the aborted counts", async () => {
		const result = await single({
			execute: async (query) => {
				throw castError(`${markerOf(query)}1:1,0`);
			},
		});
		expect(result).toEqual({ applied: [true, false] });
	});

	test("a value that echoes a rollback marker without this flush's nonce comes out as the error it is", async () => {
		for (const text of [
			"flush_rolled_back:1:1,1",
			"flush_rolled_back:0123456789abcdef0123456789abcdef:1:1,1",
		]) {
			const echoed = castError(text);
			await expect(
				single({
					execute: async () => {
						throw echoed;
					},
				}),
			).rejects.toBe(echoed);
		}
	});

	test("this flush's marker inside any other error, or another error code, is not a rollback", async () => {
		const wrapped = (query: SQL) =>
			Object.assign(
				new Error(
					`invalid input syntax for type integer: "x" near "${markerOf(query)}1:1,1"`,
				),
				{ errno: "22P02" },
			);
		const otherCode = (query: SQL) =>
			Object.assign(castError(`${markerOf(query)}1:1,1`), { errno: "57014" });
		for (const errorOf of [wrapped, otherCode]) {
			let thrown: unknown;
			const caught = await single({
				execute: async (query) => {
					thrown = errorOf(query);
					throw thrown;
				},
			}).catch((error: unknown) => error);
			expect(caught).toBe(thrown);
		}
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
