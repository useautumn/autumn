import { describe, expect, test } from "bun:test";
import {
	isPostgresConnectionFailure,
	isTransientPostgresError,
	postgresSqlStateOf,
} from "../../../src/common/postgresErrors.js";

/** The shapes Bun's driver throws: `errno` is the SQLSTATE of a server error, `code` names the driver's own failure. */
const bunError = ({ code, errno }: { code: string; errno?: string }): Error =>
	Object.assign(new Error(code), { code, ...(errno && { errno }) });

describe("postgres errors", () => {
	test.each([
		[
			"connection refused",
			bunError({ code: "ERR_POSTGRES_CONNECTION_REFUSED" }),
		],
		["connection closed", bunError({ code: "ERR_POSTGRES_CONNECTION_CLOSED" })],
		["socket reset", bunError({ code: "ECONNRESET" })],
		[
			"admin shutdown",
			bunError({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "57P01" }),
		],
		[
			"statement timeout",
			bunError({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "57014" }),
		],
		[
			"serialization failure",
			bunError({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "40001" }),
		],
	])("%s is transient", (_name, error) => {
		expect(isTransientPostgresError({ error })).toBe(true);
	});

	test.each([
		[
			"unique violation",
			bunError({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "23505" }),
		],
		[
			"division by zero",
			bunError({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "22012" }),
		],
		["an error that is not Postgres's", new Error("boom")],
		["not an error", "boom"],
	])("%s is not transient", (_name, error) => {
		expect(isTransientPostgresError({ error })).toBe(false);
	});

	test("a server error is a statement failure with a SQLSTATE; a driver failure is a connection failure without one", () => {
		const serverError = bunError({
			code: "ERR_POSTGRES_SERVER_ERROR",
			errno: "23505",
		});
		const closed = bunError({ code: "ERR_POSTGRES_CONNECTION_CLOSED" });

		expect(postgresSqlStateOf({ error: serverError })).toBe("23505");
		expect(isPostgresConnectionFailure({ error: serverError })).toBe(false);
		expect(postgresSqlStateOf({ error: closed })).toBeNull();
		expect(isPostgresConnectionFailure({ error: closed })).toBe(true);
	});
});
