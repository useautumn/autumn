import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@/internal/misc/edgeConfig/edgeConfigRegistry.js", () => ({
	registerEdgeConfig: () => undefined,
}));

import {
	_setRateLimitRedisAllowlistConfigForTesting,
	isCustomerInRedisAllowlist,
} from "@/internal/misc/rateLimiter/rateLimitRedisAllowlistStore.js";

const reset = () => {
	_setRateLimitRedisAllowlistConfigForTesting({ config: { customerIds: [] } });
};

describe("isCustomerInRedisAllowlist", () => {
	afterEach(reset);

	test("returns true for a customer in the list", () => {
		_setRateLimitRedisAllowlistConfigForTesting({
			config: { customerIds: ["customer_a"] },
		});

		expect(isCustomerInRedisAllowlist({ customerId: "customer_a" })).toBe(true);
	});

	test("returns false for a customer not in the list", () => {
		_setRateLimitRedisAllowlistConfigForTesting({
			config: { customerIds: ["customer_a"] },
		});

		expect(isCustomerInRedisAllowlist({ customerId: "customer_b" })).toBe(
			false,
		);
	});

	test("returns false when customerId is undefined", () => {
		_setRateLimitRedisAllowlistConfigForTesting({
			config: { customerIds: ["customer_a"] },
		});

		expect(isCustomerInRedisAllowlist({ customerId: undefined })).toBe(false);
	});

	test("returns false when allowlist is empty", () => {
		reset();

		expect(isCustomerInRedisAllowlist({ customerId: "customer_a" })).toBe(
			false,
		);
	});

	test("_setRateLimitRedisAllowlistConfigForTesting properly applies test config", () => {
		_setRateLimitRedisAllowlistConfigForTesting({
			config: { customerIds: ["customer_a"] },
		});

		expect(isCustomerInRedisAllowlist({ customerId: "customer_a" })).toBe(true);

		_setRateLimitRedisAllowlistConfigForTesting({
			config: { customerIds: ["customer_b"] },
		});

		expect(isCustomerInRedisAllowlist({ customerId: "customer_a" })).toBe(
			false,
		);
		expect(isCustomerInRedisAllowlist({ customerId: "customer_b" })).toBe(true);
	});
});
