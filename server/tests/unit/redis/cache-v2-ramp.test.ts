import { describe, expect, test } from "bun:test";
import {
	_setCacheV2RampConfigForTesting,
	isCacheV2RampActive,
	isCacheV2RampCacheStale,
	isCacheV2RampEnabled,
} from "@/internal/misc/cacheV2Ramp/index.js";
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

describe("isCacheV2RampEnabled", () => {
	test("returns false at 0%", () => {
		_setCacheV2RampConfigForTesting({ percent: 0 });
		const customerId = findCustomerInBucketRange({ min: 0, max: 100 });
		expect(isCacheV2RampEnabled({ customerId })).toBe(false);
	});

	test("returns true at 100% even without customerId", () => {
		_setCacheV2RampConfigForTesting({ percent: 100 });
		expect(isCacheV2RampEnabled({})).toBe(true);
	});

	test("returns false without customerId at fractional percent", () => {
		_setCacheV2RampConfigForTesting({ percent: 50 });
		expect(isCacheV2RampEnabled({})).toBe(false);
	});

	test("routes customers in low buckets when percent=50", () => {
		_setCacheV2RampConfigForTesting({ percent: 50 });
		const low = findCustomerInBucketRange({ min: 0, max: 50 });
		const high = findCustomerInBucketRange({ min: 50, max: 100 });
		expect(isCacheV2RampEnabled({ customerId: low })).toBe(true);
		expect(isCacheV2RampEnabled({ customerId: high })).toBe(false);
	});

	test("per-org override beats the global percent", () => {
		_setCacheV2RampConfigForTesting({
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
			isCacheV2RampEnabled({ orgId: "org_pinned_to_public", customerId }),
		).toBe(true);
		expect(isCacheV2RampEnabled({ orgId: "other_org", customerId })).toBe(
			false,
		);
	});

	test("per-org override can keep an org on private during a global ramp", () => {
		_setCacheV2RampConfigForTesting({
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
			isCacheV2RampEnabled({ orgId: "org_pinned_to_private", customerId }),
		).toBe(false);
		expect(isCacheV2RampEnabled({ orgId: "other_org", customerId })).toBe(true);
	});

	test("getCustomerBucket is deterministic", () => {
		expect(getCustomerBucket({ customerId: "cus_deterministic" })).toBe(
			getCustomerBucket({ customerId: "cus_deterministic" }),
		);
	});
});

describe("isCacheV2RampActive", () => {
	test("false when global percent is 0 and no org override", () => {
		_setCacheV2RampConfigForTesting({ percent: 0 });
		expect(isCacheV2RampActive({})).toBe(false);
		expect(isCacheV2RampActive({ orgId: "any_org" })).toBe(false);
	});

	test("true when global percent is non-zero", () => {
		_setCacheV2RampConfigForTesting({ percent: 1 });
		expect(isCacheV2RampActive({})).toBe(true);
	});

	test("per-org override at non-zero activates even when global is 0", () => {
		_setCacheV2RampConfigForTesting({
			percent: 0,
			orgs: {
				org_active: { percent: 5, previousPercent: 0, changedAt: 1000 },
			},
		});
		expect(isCacheV2RampActive({ orgId: "org_active" })).toBe(true);
		expect(isCacheV2RampActive({ orgId: "other_org" })).toBe(false);
	});

	test("per-org override at zero deactivates even when global is non-zero", () => {
		_setCacheV2RampConfigForTesting({
			percent: 50,
			orgs: {
				org_pinned: { percent: 0, previousPercent: 0, changedAt: 1000 },
			},
		});
		expect(isCacheV2RampActive({ orgId: "org_pinned" })).toBe(false);
	});
});

describe("isCacheV2RampCacheStale", () => {
	test("returns false when ramp has never changed", () => {
		_setCacheV2RampConfigForTesting({
			percent: 50,
			previousPercent: 50,
			changedAt: 0,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 100 });
		expect(isCacheV2RampCacheStale({ customerId, cachedAt: 500 })).toBe(false);
	});

	test("forward ramp 0% -> 50%: bucket-crossing customer with stale cachedAt is stale", () => {
		_setCacheV2RampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });
		expect(isCacheV2RampCacheStale({ customerId, cachedAt: 500 })).toBe(true);
	});

	test("forward ramp 0% -> 50%: non-crossing customer is not stale", () => {
		_setCacheV2RampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 50, max: 100 });
		expect(isCacheV2RampCacheStale({ customerId, cachedAt: 500 })).toBe(false);
	});

	test("rollback 50% -> 0%: previously-on-public customer is stale on private", () => {
		_setCacheV2RampConfigForTesting({
			percent: 0,
			previousPercent: 50,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });
		expect(isCacheV2RampCacheStale({ customerId, cachedAt: 500 })).toBe(true);
	});

	test("entries cached AFTER the changeover are not stale", () => {
		_setCacheV2RampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });
		expect(isCacheV2RampCacheStale({ customerId, cachedAt: 2000 })).toBe(false);
	});

	test("legacy entries without cachedAt are conservatively stale when bucket crossed", () => {
		_setCacheV2RampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });
		expect(isCacheV2RampCacheStale({ customerId })).toBe(true);
	});

	test("returns false when no customerId is provided", () => {
		_setCacheV2RampConfigForTesting({
			percent: 50,
			previousPercent: 0,
			changedAt: 1000,
		});
		expect(isCacheV2RampCacheStale({ cachedAt: 500 })).toBe(false);
	});
});
