import { expect, test } from "bun:test";
import { assertIdempotentCommits } from "../../../src/init/rules/assertIdempotentCommits.js";

test("a worker configured for transactional commits refuses to boot, naming the setting to change", () => {
	expect(() => assertIdempotentCommits({ mode: "transactional" })).toThrow(
		"set BALANCE_WORKER_COMMIT_MODE=idempotent",
	);
	expect(() => assertIdempotentCommits({ mode: "idempotent" })).not.toThrow();
});
