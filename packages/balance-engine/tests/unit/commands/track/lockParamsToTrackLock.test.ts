import { describe, expect, test } from "bun:test";
import { lockParamsToTrackLock } from "../../../../src/balanceEngine.js";

const occurredAt = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("lockParamsToTrackLock", () => {
	test("a lock the caller names an expiry for releases at it", () => {
		const lock = lockParamsToTrackLock({
			lock: {
				lock_id: "lock_1",
				enabled: true,
				expires_at: occurredAt + 60_000,
			},
			occurredAt,
		});

		expect(lock).toEqual({
			id: expect.stringMatching(/^lck/),
			lockId: "lock_1",
			expiresAt: occurredAt + 60_000,
			expiryAction: "release",
		});
	});

	test("a lock with no expiry is confirmed a day after it was taken, and each lock row gets its own id", () => {
		const params = {
			lock: { lock_id: "lock_1", enabled: true as const },
			occurredAt,
		};
		const first = lockParamsToTrackLock(params);

		expect(first).toEqual({
			id: expect.stringMatching(/^lck/),
			lockId: "lock_1",
			expiresAt: occurredAt + DAY_MS,
			expiryAction: "confirm",
		});
		expect(lockParamsToTrackLock(params).id).not.toBe(first.id);
	});
});
