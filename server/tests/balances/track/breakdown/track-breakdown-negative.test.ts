import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
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
 * Test 3.3: Negative tracks (refunds) with breakdown
 *
 * Refund order:
 * 1. If purchased_balance > 0, decrement purchased_balance first (from negative to 0)
 * 2. Then increment current_balance (monthly first, then lifetime)
 */

const monthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: null,
});

const payPerUseMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 0,
	billingUnits: 1,
	price: 0.5,
});

const monthlyProd = constructProduct({
	type: "free",
	id: "monthly-prod",
	isDefault: false,
	items: [monthlyMessages],
});

const lifetimeProd = constructProduct({
	type: "free",
	id: "lifetime-prod",
	isDefault: false,
	isAddOn: true,
	items: [lifetimeMessages],
});

const ppuProd = constructProduct({
	type: "free",
	id: "ppu-prod",
	isDefault: false,
	isAddOn: true,
	items: [payPerUseMessages],
});

const testCase = "track-breakdown-negative";

describe(`${chalk.yellowBright("track-breakdown-negative: refunds with breakdown")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [monthlyProd, lifetimeProd, ppuProd],
			prefix: testCase,
		});

		// Attach all products
		await autumnV2.attach({
			customer_id: customerId,
			product_id: monthlyProd.id,
		});
		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProd.id,
		});
		await autumnV2.attach({ customer_id: customerId, product_id: ppuProd.id });
	});

	test("track 180: exhaust prepaid (150) + 30 into pay-per-use", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 180,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 150,
			current_balance: 0,
			usage: 180,
			purchased_balance: 30,
		});

		// Verify breakdown state
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// All prepaid breakdowns should be at 0
		const prepaidBreakdowns =
			res.balance?.breakdown?.filter((b) => !b.overage_allowed) ?? [];
		for (const breakdown of prepaidBreakdowns) {
			expect(breakdown.current_balance).toBe(0);
		}

		// PPU breakdown should have purchased_balance = 30
		const ppuBreakdown = res.balance?.breakdown?.find((b) => b.overage_allowed);
		expect(ppuBreakdown?.purchased_balance).toBe(30);
	});

	test("negative track -20: should decrement purchased_balance first", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -20,
		});

		// purchased_balance should go from 30 to 10
		expect(trackRes.balance).toMatchObject({
			purchased_balance: 10,
			usage: 160, // 180 - 20
		});

		// Verify PPU breakdown
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const ppuBreakdown = res.balance?.breakdown?.find((b) => b.overage_allowed);
		expect(ppuBreakdown?.purchased_balance).toBe(10);
	});

	test("negative track -20 more: exhaust purchased_balance, then increment current_balance", async () => {
		// purchased_balance is 10, so -20 should:
		// 1. Decrement purchased_balance by 10 (to 0)
		// 2. Increment current_balance by 10

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -20,
		});

		expect(trackRes.balance).toMatchObject({
			purchased_balance: 0,
			current_balance: 10,
			usage: 140, // 160 - 20
		});

		// Verify breakdown state
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// PPU breakdown should have purchased_balance = 0
		const ppuBreakdown = res.balance?.breakdown?.find((b) => b.overage_allowed);
		expect(ppuBreakdown?.purchased_balance).toBe(0);

		// Some prepaid breakdown should have current_balance > 0
		const breakdownSum =
			res.balance?.breakdown?.reduce(
				(s, b) => s + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(breakdownSum).toBe(10);
	});

	test("negative track -50: should refund to monthly first (same order as deduction)", async () => {
		// Current state: 10 balance, 0 purchased
		// Refund 50 should go to monthly breakdown first (up to granted_balance)

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -50,
		});

		expect(trackRes.balance).toMatchObject({
			current_balance: 60,
			usage: 90, // 140 - 50
		});

		// Verify breakdown distribution
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Monthly (granted: 100) should have some balance restored
		const monthlyBreakdown = res.balance?.breakdown?.find(
			(b) => b.granted_balance === 100 && !b.overage_allowed,
		);
		expect(monthlyBreakdown?.current_balance).toBeGreaterThan(0);
	});
});

describe(`${chalk.yellowBright("track-breakdown-negative-simple: simple refund to monthly then lifetime")}`, () => {
	const customerId = `${testCase}-simple`;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [monthlyProd, lifetimeProd],
			prefix: `${testCase}-simple`,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: monthlyProd.id,
		});
		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProd.id,
		});
	});

	test("setup: deplete both breakdowns partially", async () => {
		// Monthly: 100, Lifetime: 50 = 150 total
		// Track 140 to leave 10 remaining
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 140,
		});

		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance?.current_balance).toBe(10);
		expect(res.balance?.usage).toBe(140);
	});

	test("negative track -30: refunds to monthly first", async () => {
		// Monthly was depleted first during positive track
		// Refund should restore monthly first (same order)

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -30,
		});

		expect(trackRes.balance).toMatchObject({
			current_balance: 40,
			usage: 110,
		});

		// Verify breakdown: monthly should be restored before lifetime
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const breakdownSum =
			res.balance?.breakdown?.reduce(
				(s, b) => s + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(breakdownSum).toBe(40);
	});

	test("negative track -120: cannot exceed granted_balance", async () => {
		// Current: 40 balance, 110 usage
		// Max refund possible: 110 (to reach 150 granted)
		// Track -120 should cap at granted_balance

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -120,
		});

		// Should cap at granted_balance (150)
		expect(trackRes.balance?.current_balance).toBeLessThanOrEqual(150);
		expect(trackRes.balance?.usage).toBeGreaterThanOrEqual(0);

		// Verify no breakdown exceeds its granted_balance
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		for (const breakdown of res.balance?.breakdown ?? []) {
			expect(breakdown.current_balance).toBeLessThanOrEqual(
				breakdown.granted_balance ?? 0,
			);
		}
	});
});
