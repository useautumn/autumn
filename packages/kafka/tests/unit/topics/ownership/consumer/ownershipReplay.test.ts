import { describe, expect, test } from "bun:test";
import { applyOwnershipRecord } from "../../../../../src/topics/ownership/consumer/ownershipReplay.js";

const claimed = {
	schemaVersion: 1 as const,
	type: "claimed" as const,
	partition: 7,
	endpoint: "http://10.0.0.4:8080",
	claimedAt: 1_700_000_000_000,
};

const unowned = {
	schemaVersion: 1 as const,
	type: "unowned" as const,
	partition: 7,
	releasedAt: 1_700_000_000_100,
};

describe("applyOwnershipRecord", () => {
	test("records a claim", () => {
		const owners = applyOwnershipRecord({
			owners: new Map(),
			record: claimed,
			offset: 3n,
		});

		expect(owners.get(7)).toEqual({
			partition: 7,
			endpoint: "http://10.0.0.4:8080",
			routeEpoch: "3",
		});
	});

	test("forgets a partition on unowned", () => {
		const claimedOwners = applyOwnershipRecord({
			owners: new Map(),
			record: claimed,
			offset: 3n,
		});

		expect(
			applyOwnershipRecord({
				owners: claimedOwners,
				record: unowned,
				offset: 4n,
			}).get(7),
		).toBeUndefined();
	});

	test("keeps the higher offset when two claims race", () => {
		const first = applyOwnershipRecord({
			owners: new Map(),
			record: claimed,
			offset: 3n,
		});
		const second = applyOwnershipRecord({
			owners: first,
			record: { ...claimed, endpoint: "http://10.0.0.8:8080" },
			offset: 9n,
		});

		expect(second.get(7)?.endpoint).toBe("http://10.0.0.8:8080");
		expect(second.get(7)?.routeEpoch).toBe("9");
	});

	test("ignores a stale claim or release", () => {
		const current = applyOwnershipRecord({
			owners: new Map(),
			record: claimed,
			offset: 9n,
		});

		expect(
			applyOwnershipRecord({
				owners: current,
				record: { ...claimed, endpoint: "http://stale:8080" },
				offset: 3n,
			}).get(7)?.endpoint,
		).toBe("http://10.0.0.4:8080");
		expect(
			applyOwnershipRecord({
				owners: current,
				record: unowned,
				offset: 3n,
			}).get(7)?.routeEpoch,
		).toBe("9");
	});
});
