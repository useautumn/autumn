import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	EntInterval,
	ErrCode,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "../../src/utils/scriptUtils/constructItem.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

const free = constructProduct({
	type: "free",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
		}),
	],
});

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

export const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

describe(`${chalk.yellowBright("temp1: Testing balances.create endpoint")}`, () => {
	const customerId = "temp1";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [free, pro, premium],
			prefix: customerId,
		});
	});

	test("should create balance with granted_balance", async () => {
		const grantedBalance = "500";

		await autumn.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: grantedBalance,
		});

		const { balances: rawBalances } = await autumn.balances.list({
			customer_id: customerId,
		});

		expect(rawBalances).toBeDefined();
		expect(rawBalances.length).toBeGreaterThan(0);
		const createdBalance = rawBalances.find(
			(b: FullCustomerEntitlement) => b.feature_id === TestFeature.Messages,
		);
		expect(createdBalance).toBeDefined();
		expect(createdBalance.balance).toBe(500);
		expect(createdBalance.entitlement.feature.id).toBe(TestFeature.Messages);
	});

	test("should create unlimited balance", async () => {
		await autumn.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			unlimited: true,
		});

		const { balances: rawBalances } = await autumn.balances.list({
			customer_id: customerId,
		});

		const createdBalance = rawBalances.find(
			(b: FullCustomerEntitlement) => b.feature_id === TestFeature.Users,
		);
		expect(createdBalance).toBeDefined();
		expect(createdBalance.unlimited).toBe(true);
		expect(createdBalance.entitlement.feature.id).toBe(TestFeature.Users);
	});

	test("should create balance with reset interval", async () => {
		// Use Action1 which is a single-use feature that can have monthly reset
		await autumn.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			granted_balance: "1000",
			reset: {
				interval: EntInterval.Month,
				interval_count: 1,
			},
		});

		const { balances: rawBalances } = await autumn.balances.list({
			customer_id: customerId,
		});

		const createdBalance = rawBalances.find(
			(b: FullCustomerEntitlement) => b.feature_id === TestFeature.Action1,
		);
		expect(createdBalance).toBeDefined();
		expect(createdBalance.balance).toBe(1000);
		expect(createdBalance.entitlement.interval).toBe(EntInterval.Month);
		expect(createdBalance.entitlement.feature.id).toBe(TestFeature.Action1);
	});

	test("should throw error if entitlement already exists", async () => {
		// Create balance first
		await autumn.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		});

		// Try to create again - should fail
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: async () => {
				return await autumn.balances.create({
					customer_id: customerId,
					feature_id: TestFeature.Dashboard,
				});
			},
		});
	});

	test("should throw error if feature not found", async () => {
		await expectAutumnError({
			errCode: ErrCode.FeatureNotFound,
			func: async () => {
				await autumn.balances.create({
					customer_id: customerId,
					feature_id: "non-existent-feature",
					granted_balance: "100",
				});
			},
		});
	});

	test("should throw error if customer not found", async () => {
		await expectAutumnError({
			errCode: ErrCode.CustomerNotFound,
			func: async () => {
				await autumn.balances.create({
					customer_id: "non-existent-customer",
					feature_id: TestFeature.Messages,
					granted_balance: "100",
				});
			},
		});
	});
});
