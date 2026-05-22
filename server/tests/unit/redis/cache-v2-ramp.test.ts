import { describe, expect, test } from "bun:test";
import {
	_setCacheV2RampConfigForTesting,
	isCacheV2RampActive,
	isCacheV2RampEnabled,
} from "@/internal/misc/cacheV2Ramp/index.js";
import { getCustomerBucket } from "@/internal/misc/rollouts/rolloutUtils.js";

const makeConfig = (
	overrides: Partial<{
		migrationPercent: number;
		previousMigrationPercent: number;
		migrationChangedAt: number;
		url: string;
		connectionString: string;
	}> = {},
) => ({
	connectionString: "encrypted-blob",
	url: "host.example.com:6379",
	migrationPercent: 0,
	previousMigrationPercent: 0,
	migrationChangedAt: 0,
	...overrides,
});

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
	test("returns false when no config is set", () => {
		_setCacheV2RampConfigForTesting(null);
		const customerId = findCustomerInBucketRange({ min: 0, max: 100 });
		expect(isCacheV2RampEnabled({ customerId })).toBe(false);
	});

	test("returns false at 0%", () => {
		_setCacheV2RampConfigForTesting(makeConfig({ migrationPercent: 0 }));
		const customerId = findCustomerInBucketRange({ min: 0, max: 100 });
		expect(isCacheV2RampEnabled({ customerId })).toBe(false);
	});

	test("returns true at 100% even without customerId", () => {
		_setCacheV2RampConfigForTesting(makeConfig({ migrationPercent: 100 }));
		expect(isCacheV2RampEnabled({})).toBe(true);
	});

	test("returns false without customerId at fractional percent", () => {
		_setCacheV2RampConfigForTesting(makeConfig({ migrationPercent: 50 }));
		expect(isCacheV2RampEnabled({})).toBe(false);
	});

	test("routes low-bucket customers when migrationPercent=50", () => {
		_setCacheV2RampConfigForTesting(makeConfig({ migrationPercent: 50 }));
		const low = findCustomerInBucketRange({ min: 0, max: 50 });
		const high = findCustomerInBucketRange({ min: 50, max: 100 });
		expect(isCacheV2RampEnabled({ customerId: low })).toBe(true);
		expect(isCacheV2RampEnabled({ customerId: high })).toBe(false);
	});

	test("getCustomerBucket is deterministic", () => {
		expect(getCustomerBucket({ customerId: "cus_deterministic" })).toBe(
			getCustomerBucket({ customerId: "cus_deterministic" }),
		);
	});
});

describe("isCacheV2RampActive", () => {
	test("false when no config is set", () => {
		_setCacheV2RampConfigForTesting(null);
		expect(isCacheV2RampActive()).toBe(false);
	});

	test("false when migrationPercent is 0", () => {
		_setCacheV2RampConfigForTesting(makeConfig({ migrationPercent: 0 }));
		expect(isCacheV2RampActive()).toBe(false);
	});

	test("true when migrationPercent > 0", () => {
		_setCacheV2RampConfigForTesting(makeConfig({ migrationPercent: 1 }));
		expect(isCacheV2RampActive()).toBe(true);
	});
});
