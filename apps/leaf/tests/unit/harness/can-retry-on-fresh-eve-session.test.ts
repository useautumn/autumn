import { describe, expect, test } from "bun:test";
import { canRetryOnFreshEveSession } from "../../../src/harness/eve/canRetryOnFreshEveSession.js";

describe("canRetryOnFreshEveSession", () => {
	test("retries a session that never streamed a single event", () => {
		expect(
			canRetryOnFreshEveSession({
				alreadyRetried: false,
				sessionIsNew: false,
				streamedAnyEvent: false,
			}),
		).toBe(true);
	});

	test("never replays a turn that ran — its side effects already happened", () => {
		expect(
			canRetryOnFreshEveSession({
				alreadyRetried: false,
				sessionIsNew: false,
				streamedAnyEvent: true,
			}),
		).toBe(false);
	});

	test("does not retry twice", () => {
		expect(
			canRetryOnFreshEveSession({
				alreadyRetried: true,
				sessionIsNew: false,
				streamedAnyEvent: false,
			}),
		).toBe(false);
	});

	test("does not retry a session created by this very run", () => {
		expect(
			canRetryOnFreshEveSession({
				alreadyRetried: false,
				sessionIsNew: true,
				streamedAnyEvent: false,
			}),
		).toBe(false);
	});
});
