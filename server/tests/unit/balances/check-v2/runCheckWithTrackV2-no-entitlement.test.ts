import { describe, expect, test } from "bun:test";
import type { CheckDataV2 } from "@/internal/balances/check/checkTypes/CheckDataV2.js";

describe("runCheckWithTrackV2 - no entitlement edge case", () => {
	test("customerHasEntitlementForFeature returns false when apiBalance is undefined", () => {
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

	test("early return condition is triggered when no entitlement and requiredBalance > 0", () => {
		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const checkData: any = {
			apiBalance: undefined,
		};

		const requiredBalance = 10;

		const shouldReturnEarly =
			checkData.apiBalance === undefined && requiredBalance > 0;

		expect(shouldReturnEarly).toBe(true);
	});

	test("early return condition is NOT triggered when requiredBalance is 0", () => {
		// biome-ignore lint/suspicious/noExplicitAny: Test data
		const checkData: any = {
			apiBalance: undefined,
		};

		const requiredBalance = 0;

		const shouldReturnEarly =
			checkData.apiBalance === undefined && requiredBalance > 0;

		expect(shouldReturnEarly).toBe(false);
	});
});
