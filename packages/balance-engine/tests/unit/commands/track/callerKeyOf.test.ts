import { describe, expect, test } from "bun:test";
import { callerKeyOf } from "../../../../src/balanceEngine.js";
import { createTrackCommand } from "../../engineFixtures.js";

const trackClaiming = ({ key }: { key: string | null }) => ({
	...createTrackCommand({ requestId: "req_1" }),
	...(key !== null && { idempotency: { key, ttlMs: 60_000 } }),
});

describe("callerKeyOf", () => {
	test("a track claiming its caller's key names that claim key", () => {
		expect(callerKeyOf({ command: trackClaiming({ key: "track:k_1" }) })).toBe(
			"track:k_1",
		);
		expect(callerKeyOf({ command: trackClaiming({ key: "check_key" }) })).toBe(
			"check_key",
		);
	});

	test("a track claiming nothing has no caller key", () => {
		expect(callerKeyOf({ command: trackClaiming({ key: null }) })).toBeNull();
	});
});
