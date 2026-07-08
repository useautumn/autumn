// TEMP scratch (will be removed): proves tw retries re-run the WHOLE file.
// Test 2 fails on attempt 1; on attempt 2 it passes only if test 1 ran in the
// same process — i.e. only under whole-file retry.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const ATTEMPT_FILE = "/tmp/scratch-retry-proof-attempt";

let stateFromTest1 = false;

describe("scratch-retry-proof", () => {
	test("sets in-process state", () => {
		stateFromTest1 = true;
		expect(stateFromTest1).toBe(true);
	});

	test("fails first attempt, needs test 1 state on retry", () => {
		const attempt = existsSync(ATTEMPT_FILE)
			? Number(readFileSync(ATTEMPT_FILE, "utf8")) + 1
			: 1;
		writeFileSync(ATTEMPT_FILE, String(attempt));

		if (attempt === 1) {
			throw new Error("deliberate first-attempt flake");
		}

		expect(stateFromTest1).toBe(true);
	});
});
