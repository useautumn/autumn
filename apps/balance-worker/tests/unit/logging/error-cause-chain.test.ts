import { expect, test } from "bun:test";
import { errorCauseChain } from "../../../src/logging/errorCauseChain.js";

test("lists nested causes by name and message, stopping on cycles", () => {
	const root = new Error("connection refused");
	root.name = "PostgresError";
	const middle = new Error("bootstrap failed", { cause: root });
	const top = new Error("requires recovery", { cause: middle });
	root.cause = top;
	expect(errorCauseChain({ error: top })).toEqual([
		{ name: "Error", message: "bootstrap failed" },
		{ name: "PostgresError", message: "connection refused" },
	]);
	expect(errorCauseChain({ error: "not an error" })).toEqual([]);
});
