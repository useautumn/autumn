import { describe, expect, test } from "bun:test";
import { shouldDropEveSession } from "../../../src/harness/eve/shouldDropEveSession.js";

describe("shouldDropEveSession", () => {
	test("drops a session that never streamed a single event", () => {
		expect(
			shouldDropEveSession({
				endedWithoutOutput: undefined,
				streamedAnyEvent: false,
			}),
		).toBe(true);
	});

	test("drops a turn that woke parked on an unanswerable request", () => {
		expect(
			shouldDropEveSession({
				endedWithoutOutput: "waiting",
				streamedAnyEvent: true,
			}),
		).toBe(true);
	});

	test("keeps the session when the turn simply completed empty", () => {
		expect(
			shouldDropEveSession({
				endedWithoutOutput: "completed",
				streamedAnyEvent: true,
			}),
		).toBe(false);
	});

	test("keeps the session when the loop exited with no terminal event", () => {
		expect(
			shouldDropEveSession({
				endedWithoutOutput: undefined,
				streamedAnyEvent: true,
			}),
		).toBe(false);
	});

	test("drops a silent session even if a stale terminal event completed it", () => {
		expect(
			shouldDropEveSession({
				endedWithoutOutput: "completed",
				streamedAnyEvent: false,
			}),
		).toBe(true);
	});
});
