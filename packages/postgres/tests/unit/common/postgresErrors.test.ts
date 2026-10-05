import { describe, expect, test } from "bun:test";
import {
	isPostgresConnectionFailure,
	isTransientPostgresError,
	postgresSqlStateOf,
} from "../../../src/common/postgresErrors.js";
import { databaseError } from "../../fixtures/databaseError.js";

/** The driver's own failures: a socket code, or only pg's message. */
const socketError = ({ code }: { code: string }): Error =>
	Object.assign(new Error(code), { code });

describe("postgres errors", () => {
	test.each([
		["connection refused", socketError({ code: "ECONNREFUSED" })],
		["socket reset", socketError({ code: "ECONNRESET" })],
		["host not found", socketError({ code: "ENOTFOUND" })],
		["DNS lookup timed out", socketError({ code: "EAI_AGAIN" })],
		["host unreachable", socketError({ code: "EHOSTUNREACH" })],
		["network unreachable", socketError({ code: "ENETUNREACH" })],
		["query read timeout", new Error("Query read timeout")],
		["connection dropped", new Error("Connection terminated unexpectedly")],
		[
			"pool checkout timeout",
			new Error("timeout exceeded when trying to connect"),
		],
		["connect timeout", new Error("timeout expired")],
		["closed client", new Error("Client was closed and is not queryable")],
		[
			"protocol desync",
			new Error("Received unexpected dataRow message from backend."),
		],
		[
			"admin shutdown",
			databaseError({ message: "terminating connection", code: "57P01" }),
		],
		[
			"statement timeout",
			databaseError({ message: "canceling statement", code: "57014" }),
		],
		[
			"serialization failure",
			databaseError({ message: "could not serialize", code: "40001" }),
		],
	])("%s is transient", (_name, error) => {
		expect(isTransientPostgresError({ error })).toBe(true);
	});

	test.each([
		[
			"unique violation",
			databaseError({ message: "duplicate key", code: "23505" }),
		],
		[
			"division by zero",
			databaseError({ message: "division by zero", code: "22012" }),
		],
		["an error that is not Postgres's", new Error("boom")],
		["not an error", "boom"],
	])("%s is not transient", (_name, error) => {
		expect(isTransientPostgresError({ error })).toBe(false);
	});

	test("a server error is a statement failure with a SQLSTATE; a driver failure is a connection failure without one", () => {
		const serverError = databaseError({
			message: "Connection terminated by the server's own words",
			code: "23505",
		});
		const timedOut = new Error("Query read timeout");

		expect(postgresSqlStateOf({ error: serverError })).toBe("23505");
		expect(isPostgresConnectionFailure({ error: serverError })).toBe(false);
		expect(postgresSqlStateOf({ error: timedOut })).toBeNull();
		expect(isPostgresConnectionFailure({ error: timedOut })).toBe(true);
	});
});
