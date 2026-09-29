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

test("follows an aggregate's first member and says how many there were", () => {
	const refused = new Error("Kafka batch was not committed", {
		cause: new Error("CONCURRENT_TRANSACTIONS"),
	});
	refused.name = "KafkaBatchNotCommittedError";
	const retirement = new AggregateError(
		[refused, new Error("second partition")],
		"Partition retirement did not settle safely",
	);
	const top = new Error("Balance worker error", { cause: retirement });
	expect(errorCauseChain({ error: top })).toEqual([
		{
			name: "AggregateError",
			message:
				"Partition retirement did not settle safely (2 errors, first follows)",
		},
		{
			name: "KafkaBatchNotCommittedError",
			message: "Kafka batch was not committed",
		},
		{ name: "Error", message: "CONCURRENT_TRANSACTIONS" },
	]);
});
