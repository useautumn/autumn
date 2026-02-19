import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: Track → Attach race condition (Redis-Postgres sync)
 *
 * This test verifies that when tracking exhausts a balance into overage,
 * then attaching a new product, the balances are correctly merged.
 *
 * IMPORTANT: There's a race condition between track and attach:
 * - Track updates Redis immediately, syncs to Postgres asynchronously
 * - Attach rebuilds cache from Postgres
 * - If attach happens before sync, cache gets stale data
 *
 * This test includes timeout(2000) between track and attach to avoid the race.
 *
 * Scenario:
 * 1. Attach pay-per-use monthly (500 included, overage allowed)
 * 2. Track 600 → 500 prepaid exhausted, 100 in overage
 * 3. Wait for sync, then attach lifetime prepaid (200 messages)
 * 4. Track 150 → should deduct from lifetime prepaid first, not add to overage
 * 5. Track 100 → exhaust lifetime (50 remaining), then 50 goes to overage
 */

const monthlyPayPerUseMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	price: 0.01,
	billingUnits: 1,
});

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null, // lifetime
});

const payPerUseProd = constructProduct({
	type: "free",
	id: "pay-per-use-prod",
	isDefault: false,
	items: [monthlyPayPerUseMessages],
});

const lifetimeProd = constructProduct({
	type: "free",
	id: "lifetime-prod",
	isAddOn: true,
	isDefault: false,
	items: [lifetimeMessages],
});

const testCase = "track-breakdown-sync";

describe(`${chalk.yellowBright("track-breakdown-sync: track→attach race condition test")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success", // Required for pay-per-use
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [payPerUseProd, lifetimeProd],
			prefix: testCase,
		});

		// Only attach pay-per-use product initially
		await autumnV2.attach({
			customer_id: customerId,
			product_id: payPerUseProd.id,
		});
	});

	test("should have initial balance of 500 (pay-per-use only)", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 500,
			current_balance: 500,
			usage: 0,
			purchased_balance: 0,
			overage_allowed: true,
		});

		// Should have 1 breakdown item
		expect(res.balance?.breakdown).toHaveLength(1);
	});

	test("track 600: exhaust prepaid (500) and go into overage (100)", async () => {
		const deductValue = 600;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// 500 from prepaid, 100 from overage
		expect(trackRes.balance).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 600,
			purchased_balance: 100,
		});

		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(1);

		expect(breakdown?.[0]).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 600,
			purchased_balance: 100,
			overage_allowed: true,
		});

		// // CRITICAL: Wait for Redis → Postgres sync before attaching new product
		// // Without this, attach would rebuild cache from stale Postgres data
		// await timeout(2000);
	});

	test("attach lifetime prepaid product (after sync)", async () => {
		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProd.id,
		});

		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Now have: 500 granted (monthly) + 200 granted (lifetime) = 700 total granted
		// Current balance: 0 (monthly exhausted) + 200 (lifetime) = 200
		// Purchased balance: 100 (monthly overage)
		expect(res.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 200, // Only lifetime has balance left
			usage: 600,
			purchased_balance: 100,
		});

		// Should now have 2 breakdown items
		expect(res.balance?.breakdown).toHaveLength(2);

		const payPerUseBreakdown = res.balance?.breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = res.balance?.breakdown?.find(
			(b) => b.overage_allowed === false,
		);

		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 600,
			purchased_balance: 100,
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
			purchased_balance: 0,
		});

		await timeout(2000);
	});

	test("track 150: should deduct from lifetime prepaid, NOT add to overage", async () => {
		const deductValue = 150;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// Lifetime has 200, deduct 150 → 50 remaining
		// Monthly overage should stay at 100 (no additional overage)
		expect(trackRes.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 50, // Only lifetime has balance left
			usage: 750, // 600 + 150
			purchased_balance: 100, // Unchanged! No new overage
		});

		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(2);

		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);

		// Pay-per-use should be unchanged
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 600, // Unchanged
			purchased_balance: 100, // Unchanged
		});

		// Lifetime should have 150 deducted
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 50,
			usage: 150,
			purchased_balance: 0,
		});

		// V1 verification
		const customer = await autumnV1.customers.get(customerId);
		const msgesFeature = customer.features[TestFeature.Messages];

		// Sum of breakdown balances should equal top-level balance
		const monthlyBreakdownV1 = msgesFeature.breakdown?.find(
			(b) => b.interval === "month",
		);
		const lifetimeBreakdownV1 = msgesFeature.breakdown?.find(
			(b) => b.interval === "lifetime",
		);

		const sumOfBreakdownBalances =
			(monthlyBreakdownV1?.balance ?? 0) + (lifetimeBreakdownV1?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});

	test("track 100: exhaust lifetime (50 remaining), then 50 goes to overage", async () => {
		const deductValue = 100;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		// Lifetime has 50, deduct all → 0 remaining
		// Remaining 50 goes to monthly overage
		expect(trackRes.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 0,
			usage: 850, // 750 + 100
			purchased_balance: 150, // 100 + 50 new overage
		});

		const breakdown = trackRes.balance?.breakdown;
		expect(breakdown).toHaveLength(2);

		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);

		// Pay-per-use should have 50 more overage
		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 650, // 600 + 50 overage
			purchased_balance: 150, // 100 + 50
		});

		// Lifetime should be exhausted
		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 0,
			usage: 200,
			purchased_balance: 0,
		});
	});

	test("verify DB sync with skip_cache=true", async () => {
		await timeout(2000);

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});

		const balance = customer.balances[TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 700,
			current_balance: 0,
			usage: 850,
			purchased_balance: 150,
		});

		const breakdown = balance.breakdown;
		expect(breakdown).toHaveLength(2);

		const payPerUseBreakdown = breakdown?.find(
			(b) => b.overage_allowed === true,
		);
		const lifetimeBreakdown = breakdown?.find(
			(b) => b.overage_allowed === false,
		);

		expect(payPerUseBreakdown).toMatchObject({
			granted_balance: 500,
			current_balance: 0,
			usage: 650,
			purchased_balance: 150,
		});

		expect(lifetimeBreakdown).toMatchObject({
			granted_balance: 200,
			current_balance: 0,
			usage: 200,
			purchased_balance: 0,
		});

		// V1 API verification with skip_cache
		const customerV1 = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const msgesFeature = customerV1.features[TestFeature.Messages];

		expect(msgesFeature.usage).toBe(850);

		// Verify sum of breakdown balances
		const monthlyBreakdownV1 = msgesFeature.breakdown?.find(
			(b) => b.interval === "month",
		);
		const lifetimeBreakdownV1 = msgesFeature.breakdown?.find(
			(b) => b.interval === "lifetime",
		);

		expect(monthlyBreakdownV1?.usage).toBe(650);
		expect(lifetimeBreakdownV1?.usage).toBe(200);

		const sumOfBreakdownBalances =
			(monthlyBreakdownV1?.balance ?? 0) + (lifetimeBreakdownV1?.balance ?? 0);
		expect(msgesFeature.balance).toBe(sumOfBreakdownBalances);
	});

	test("check endpoint should also match after DB sync", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 700,
			current_balance: 0,
			usage: 850,
			purchased_balance: 150,
		});
	});
});
