import { describe, expect, test } from "bun:test";
import {
	_setDragonflyRampConfigForTesting,
	isDragonflyPublicEnabled,
	isDragonflyRampActive,
	isDragonflyRampCacheStale,
} from "@/internal/misc/dragonflyRamp/index.js";
import { getCustomerBucket } from "@/internal/misc/rollouts/rolloutUtils.js";

const findCustomerInBucketRange = ({
	min,
	max,
}: {
	min: number;
	max: number;
}): string => {
	for (let index = 0; index < 10_000; index++) {
		const customerId = `cus_ramp_${index}`;
		const bucket = getCustomerBucket({ customerId });
		if (bucket >= min && bucket < max) return customerId;
	}
	throw new Error(`No customer found in bucket range [${min}, ${max})`);
};

describe("isDragonflyPublicEnabled", () => {
	test("returns false at 0%", () => {
		_setDragonflyRampConfigForTesting({ percent: 0 });
		const customerId = findCustomerInBucketRange({ min: 0, max: 100 });
		expect(isDragonflyPublicEnabled({ customerId })).toBe(false);
	});

	test("returns true at 100% even without customerId", () => {
		_setDragonflyRampConfigForTesting({ percent: 100 });
		expect(isDragonflyPublicEnabled({})).toBe(true);
	});

	test("returns false without customerId at fractional percent", () => {
		_setDragonflyRampConfigForTesting({ percent: 50 });
		expect(isDragonflyPublicEnabled({})).toBe(false);
	});

	test("routes customers in low buckets when percent=50", () => {
		_setDragonflyRampConfigForTesting({ percent: 50 });
		const low = findCustomerInBucketRange({ min: 0, max: 50 });
		const high = findCustomerInBucketRange({ min: 50, max: 100 });
		expect(isDragonflyPublicEnabled({ customerId: low })).toBe(true);
		expect(isDragonflyPublicEnabled({ customerId: high })).toBe(false);
	});

	test("per-org override beats the global percent", () => {
		_setDragonflyRampConfigForTesting({
			percent: 0,
			orgs: {
				org_pinned_to_public: {
					percent: 100,
					previousPercent: 0,
					changedAt: 0,
				},
			},
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 100 });
		expect(
			isDragonflyPublicEnabled({ orgId: "org_pinned_to_public", customerId }),
		).toBe(true);
		expect(isDragonflyPublicEnabled({ orgId: "other_org", customerId })).toBe(
			false,
		);
	});

	test("per-org override can keep an org on private during a global ramp", () => {
		_setDragonflyRampConfigForTesting({
			percent: 100,
			orgs: {
				org_pinned_to_private: {
					percent: 0,
					previousPercent: 0,
					changedAt: 0,
				},
			},
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 100 });
		expect(
			isDragonflyPublicEnabled({ orgId: "org_pinned_to_private", customerId }),
		).toBe(false);
		expect(isDragonflyPublicEnabled({ orgId: "other_org", customerId })).toBe(
			true,
		);
	});

	test("getCustomerBucket is deterministic", () => {
		expect(getCustomerBucket({ customerId: "cus_deterministic" })).toBe(
			getCustomerBucket({ customerId: "cus_deterministic" }),
		);
	});
});

describe("isDragonflyRampActive", () => {
	test("false when global percent is 0 and no org override", () => {
		_setDragonflyRampConfigForTesting({ percent: 0 });
		expect(isDragonflyRampActive({})).toBe(false);
		expect(isDragonflyRampActive({ orgId: "any_org" })).toBe(false);
	});

	test("true when global percent is non-zero", () => {
		_setDragonflyRampConfigForTesting({ percent: 1 });
		expect(isDragonflyRampActive({})).toBe(true);
	});

	test("per-org override at non-zero activates even when global is 0", () => {
		_setDragonflyRampConfigForTesting({
			percent: 0,
			orgs: {
				org_active: { percent: 5, previousPercent: 0, changedAt: 1000 },
			},
		});
		expect(isDragonflyRampActive({ orgId: "org_active" })).toBe(true);
		expect(isDragonflyRampActive({ orgId: "other_org" })).toBe(false);
	});

	test("per-org override at zero deactivates even when global is non-zero", () => {
		_setDragonflyRampConfigForTesting({
			percent: 50,
			orgs: {
				org_pinned: { percent: 0, previousPercent: 0, changedAt: 1000 },
			},
		});
		expect(isDragonflyRampActive({ orgId: "org_pinned" })).toBe(false);
	});
});

describe("isDragonflyRampCacheStale", () => {
	test("returns false when ramp has never changed", () => {
		_setDragonflyRampConfigForTesting({
			percent: 50,
			previousPercent: 50,
			changedAt: 0,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 100 });
		expect(isDragonflyRampCacheStale({ customerId, cachedAt: 500 })).toBe(
			false,
		);
	});

	test("forward ramp 0% -> 50%: bucket-crossing customer with stale cachedAt is stale", () => {
		_setDragonflyRampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });
		expect(isDragonflyRampCacheStale({ customerId, cachedAt: 500 })).toBe(true);
	});

	test("forward ramp 0% -> 50%: non-crossing customer is not stale", () => {
		_setDragonflyRampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 50, max: 100 });
		expect(isDragonflyRampCacheStale({ customerId, cachedAt: 500 })).toBe(
			false,
		);
	});

	test("rollback 50% -> 0%: previously-on-public customer is stale on private", () => {
		_setDragonflyRampConfigForTesting({
			percent: 0,
			previousPercent: 50,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });
		expect(isDragonflyRampCacheStale({ customerId, cachedAt: 500 })).toBe(true);
	});

	test("entries cached AFTER the changeover are not stale", () => {
		_setDragonflyRampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });
		expect(isDragonflyRampCacheStale({ customerId, cachedAt: 2000 })).toBe(
			false,
		);
	});

	test("legacy entries without cachedAt are conservatively stale when bucket crossed", () => {
		_setDragonflyRampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });
		expect(isDragonflyRampCacheStale({ customerId })).toBe(true);
	});

	test("returns false when no customerId is provided", () => {
		_setDragonflyRampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		expect(isDragonflyRampCacheStale({ cachedAt: 500 })).toBe(false);
	});
});
