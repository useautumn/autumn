import { AppEnv, BillingInterval } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import {
	autumnIntervalToRcDuration,
	autumnIntervalToStoreDuration,
	getRcStoreIdentifier,
	getSubscriptionGroupName,
	isRevenueCatPushEnabled,
} from "@/external/revenueCat/sync/revenuecatProductSyncUtils.js";

describe("autumnIntervalToRcDuration (ISO-8601, for createProduct)", () => {
	test("maps supported intervals", () => {
		expect(
			autumnIntervalToRcDuration({ interval: BillingInterval.Month, intervalCount: 1 }),
		).toBe("P1M");
		expect(
			autumnIntervalToRcDuration({ interval: BillingInterval.Year, intervalCount: 1 }),
		).toBe("P1Y");
		expect(
			autumnIntervalToRcDuration({ interval: BillingInterval.Month, intervalCount: 12 }),
		).toBe("P1Y");
	});
	test("lossy → null", () => {
		expect(
			autumnIntervalToRcDuration({ interval: BillingInterval.Month, intervalCount: 4 }),
		).toBeNull();
	});
});

describe("autumnIntervalToStoreDuration (enum, for create_in_store)", () => {
	test("maps supported intervals to RC store enum", () => {
		expect(
			autumnIntervalToStoreDuration({ interval: BillingInterval.Month, intervalCount: 1 }),
		).toBe("ONE_MONTH");
		expect(
			autumnIntervalToStoreDuration({ interval: BillingInterval.Month, intervalCount: 3 }),
		).toBe("THREE_MONTHS");
		expect(
			autumnIntervalToStoreDuration({ interval: BillingInterval.SemiAnnual, intervalCount: 1 }),
		).toBe("SIX_MONTHS");
		expect(
			autumnIntervalToStoreDuration({ interval: BillingInterval.Year, intervalCount: 1 }),
		).toBe("ONE_YEAR");
		expect(
			autumnIntervalToStoreDuration({ interval: BillingInterval.Week, intervalCount: 1 }),
		).toBe("ONE_WEEK");
	});
	test("lossy → null", () => {
		expect(
			autumnIntervalToStoreDuration({ interval: BillingInterval.Year, intervalCount: 2 }),
		).toBeNull();
	});
});

describe("getRcStoreIdentifier", () => {
	test("uses org id, env, plan id", () => {
		expect(
			getRcStoreIdentifier({ env: AppEnv.Live, orgId: "org_123", planId: "pro" }),
		).toBe("autumn.live.org_123.pro");
		expect(
			getRcStoreIdentifier({ env: AppEnv.Sandbox, orgId: "org_123", planId: "pro" }),
		).toBe("autumn.sandbox.org_123.pro");
	});
});

describe("getSubscriptionGroupName", () => {
	test("default when group empty/null", () => {
		expect(getSubscriptionGroupName()).toBe("Autumn - Default Group");
		expect(getSubscriptionGroupName(null)).toBe("Autumn - Default Group");
		expect(getSubscriptionGroupName("")).toBe("Autumn - Default Group");
	});
	test("uses the plan group when set", () => {
		expect(getSubscriptionGroupName("Premium")).toBe("Autumn - Premium Group");
	});
});

describe("isRevenueCatPushEnabled", () => {
	const oauth = { access_token: "a", refresh_token: "r", expires_at: 0 };
	test("live needs oauth, sandbox needs sandbox_oauth", () => {
		expect(isRevenueCatPushEnabled({ revenueCatConfig: { oauth }, env: AppEnv.Live })).toBe(true);
		expect(isRevenueCatPushEnabled({ revenueCatConfig: {}, env: AppEnv.Live })).toBe(false);
		expect(
			isRevenueCatPushEnabled({ revenueCatConfig: { sandbox_oauth: oauth }, env: AppEnv.Sandbox }),
		).toBe(true);
		expect(isRevenueCatPushEnabled({ revenueCatConfig: { oauth }, env: AppEnv.Sandbox })).toBe(false);
	});
});
