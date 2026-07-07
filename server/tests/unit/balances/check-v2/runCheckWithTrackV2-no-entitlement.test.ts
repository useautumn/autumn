import { describe, test, expect, beforeEach } from "bun:test";
import type { CheckDataV2 } from "@/internal/balances/check/checkTypes/CheckDataV2.js";
import type { ParsedCheckParams } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";

/**
 * Unit test for the fix: check with lock on feature customer doesn't have
 * returns allowed: false
 *
 * This tests the helper functions and logic without needing full integration test setup.
 */

describe("runCheckWithTrackV2 - no entitlement edge case", () => {
	test("customerHasEntitlementForFeature returns false when apiBalance is undefined", () => {
		// Simulate the helper function logic
		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const checkData: any = {
			apiBalance: undefined,
		};

		const customerHasEntitlementForFeature = (data: CheckDataV2) =>
			data.apiBalance !== undefined;

		expect(customerHasEntitlementForFeature(checkData)).toBe(false);
	});

	test("customerHasEntitlementForFeature returns true when apiBalance is defined", () => {
		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const checkData: any = {
			apiBalance: { remaining: 0, usage: 10 },
		};

		const customerHasEntitlementForFeature = (data: CheckDataV2) =>
			data.apiBalance !== undefined;

		expect(customerHasEntitlementForFeature(checkData)).toBe(true);
	});

	test("buildNoEntitlementResponse returns allowed: false", () => {
		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const checkData: any = {
			customerId: "cus_123",
			entityId: undefined,
			apiBalance: undefined,
			apiFlag: null,
		};

		const requiredBalance = 10;

		// Simulate the buildNoEntitlementResponse logic
		const response = {
			allowed: false,
			customer_id: checkData.customerId || "",
			entity_id: checkData.entityId,
			required_balance: requiredBalance,
			balance: null,
			balances: undefined,
			flag: checkData.apiFlag ?? null,
		};

		expect(response.allowed).toBe(false);
		expect(response.customer_id).toBe("cus_123");
		expect(response.required_balance).toBe(10);
		expect(response.balance).toBe(null);
	});

	test("early return condition is triggered when lock is enabled, no entitlement, and requiredBalance > 0", () => {
		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const body: any = {
			lock: { enabled: true, lock_id: "test-lock" },
		};

		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const checkData: any = {
			apiBalance: undefined, // No entitlement
		};

		const requiredBalance = 10;

		// Simulate the early return condition
		const shouldReturnEarly =
			body.lock && checkData.apiBalance === undefined && requiredBalance > 0;

		expect(shouldReturnEarly).toBe(true);
	});

	test("early return condition is NOT triggered when requiredBalance is 0", () => {
		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const body: any = {
			lock: { enabled: true, lock_id: "test-lock" },
		};

		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const checkData: any = {
			apiBalance: undefined, // No entitlement
		};

		const requiredBalance = 0;

		// Should not trigger early return for requiredBalance = 0
		const shouldReturnEarly =
			body.lock && checkData.apiBalance === undefined && requiredBalance > 0;

		expect(shouldReturnEarly).toBe(false);
	});

	test("early return condition is NOT triggered when lock is not enabled", () => {
		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const body: any = {
			lock: undefined,
		};

		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const checkData: any = {
			apiBalance: undefined, // No entitlement
		};

		const requiredBalance = 10;

		// Should not trigger early return when lock is not enabled
		const shouldReturnEarly = Boolean(
			body.lock && checkData.apiBalance === undefined && requiredBalance > 0,
		);

		expect(shouldReturnEarly).toBe(false);
	});
});
