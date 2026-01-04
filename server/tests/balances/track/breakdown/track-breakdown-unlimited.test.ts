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
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test 12.1: One breakdown unlimited, others limited
 *
 * When one product grants unlimited access to a feature,
 * the entire feature becomes unlimited. Expected:
 * - unlimited: true at top level
 * - Only 1 breakdown item (for the unlimited feature)
 * - Breakdown has all zeros (as per apiBalanceUtils.ts)
 */

const limitedMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const unlimitedMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	unlimited: true,
});

const limitedProd = constructProduct({
	type: "free",
	id: "limited-prod",
	isDefault: false,
	items: [limitedMessages],
});

const unlimitedProd = constructProduct({
	type: "free",
	id: "unlimited-prod",
	isDefault: false,
	isAddOn: true,
	items: [unlimitedMessages],
});

const testCase = "track-breakdown-unlimited";

describe(`${chalk.yellowBright("track-breakdown-unlimited: limited + unlimited products")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [limitedProd, unlimitedProd],
			prefix: testCase,
		});

		// Attach limited product first
		await autumnV2.attach({
			customer_id: customerId,
			product_id: limitedProd.id,
		});
	});

	test("with only limited product: has 1 breakdown with 100 balance", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance?.unlimited).toBe(false);
		expect(res.balance?.granted_balance).toBe(100);
		expect(res.balance?.breakdown).toHaveLength(1);
		expect(res.balance?.breakdown?.[0]?.granted_balance).toBe(100);
	});

	test("attach unlimited product: feature becomes unlimited with 1 breakdown", async () => {
		await autumnV2.attach({
			customer_id: customerId,
			product_id: unlimitedProd.id,
		});

		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Feature should be unlimited
		expect(res.balance?.unlimited).toBe(true);

		// Should have only 1 breakdown (unlimited trumps limited)
		expect(res.balance?.breakdown).toHaveLength(1);

		// Breakdown should have all zeros (as per apiBalanceUtils.ts)
		const breakdown = res.balance?.breakdown?.[0];
		expect(breakdown).toMatchObject({
			granted_balance: 0,
			purchased_balance: 0,
			current_balance: 0,
			usage: 0,
		});
	});

	test("track on unlimited feature: allowed but no balance change", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1000,
		});

		// Track should succeed

		// Balance should still show unlimited with zeros
		expect(trackRes.balance?.unlimited).toBe(true);
		expect(trackRes.balance?.breakdown).toHaveLength(1);
	});

	test("check returns allowed=true for any amount", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 999999,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.unlimited).toBe(true);
	});
});

describe(`${chalk.yellowBright("track-breakdown-unlimited-first: unlimited attached first")}`, () => {
	const customerId = `${testCase}-first`;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [limitedProd, unlimitedProd],
			prefix: `${testCase}-first`,
		});

		// Attach unlimited product first
		await autumnV2.attach({
			customer_id: customerId,
			product_id: unlimitedProd.id,
		});
	});

	test("unlimited product first: has 1 breakdown with unlimited", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance?.unlimited).toBe(true);
		expect(res.balance?.breakdown).toHaveLength(1);
	});

	test("attach limited product after: still unlimited with 1 breakdown", async () => {
		await autumnV2.attach({
			customer_id: customerId,
			product_id: limitedProd.id,
		});

		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Should still be unlimited (unlimited wins regardless of order)
		expect(res.balance?.unlimited).toBe(true);

		// Should still have only 1 breakdown
		expect(res.balance?.breakdown).toHaveLength(1);
	});
});
