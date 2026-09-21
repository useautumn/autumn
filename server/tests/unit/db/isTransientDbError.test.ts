import { describe, expect, test } from "bun:test";
import { isTransientDbError } from "@/db/dbUtils.js";

describe("isTransientDbError", () => {
	test("matches a raw pg connection drop", () => {
		expect(
			isTransientDbError({
				error: new Error("Connection terminated unexpectedly"),
			}),
		).toBe(true);
	});

	test("matches a drizzle-wrapped pg connection drop", () => {
		const wrapped = new Error("Failed query: select 1\nparams: []");
		wrapped.cause = new Error("Connection terminated unexpectedly");
		expect(isTransientDbError({ error: wrapped })).toBe(true);
	});

	test("matches a trigger-prefixed connection drop", () => {
		expect(
			isTransientDbError({
				error: new Error(
					"Error in run-migration-chunk: Connection terminated unexpectedly",
				),
			}),
		).toBe(true);
	});

	test("matches pg's dead-client error left behind by a masked drop", () => {
		expect(
			isTransientDbError({
				error: new Error(
					"Client has encountered a connection error and is not queryable",
				),
			}),
		).toBe(true);
	});

	test("matches an idle-in-transaction session timeout by SQLSTATE", () => {
		const error = Object.assign(
			new Error("terminating connection due to idle-in-transaction timeout"),
			{ code: "25P03" },
		);
		expect(isTransientDbError({ error })).toBe(true);
	});

	test("does not match an application error", () => {
		expect(isTransientDbError({ error: new Error("unique constraint") })).toBe(
			false,
		);
	});
});
