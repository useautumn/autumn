import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV1,
	type CheckResponseV2,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const monthlyMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
	interval: ProductItemInterval.Month,
});

const lifetimeWords = constructFeatureItem({
	featureId: TestFeature.Words,
	includedUsage: 300,
	interval: null,
});

const unlimitedCredits = constructFeatureItem({
	featureId: TestFeature.Credits,
	unlimited: true,
});

const dashboard = constructFeatureItem({
	featureId: TestFeature.Dashboard,
	isBoolean: true,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [monthlyMessages, lifetimeWords, unlimitedCredits, dashboard],
});

const testCase = "check-breakdown1";

describe(`${chalk.yellowBright("check-breakdown1: 1 breakdown item always follows parent balance exactly")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});
	});

	test("check-breakdown1: should have correct v2 response", async () => {
		await autumnV2.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});

		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const parentBalance = res.balance;
		const breakdownItem = res.balance?.breakdown?.[0];
		expect(breakdownItem).toBeDefined();

		expect(breakdownItem).toMatchObject({
			granted_balance: parentBalance?.granted_balance,
			purchased_balance: parentBalance?.purchased_balance,
			current_balance: parentBalance?.current_balance,
			usage: parentBalance?.usage,
			overage_allowed: parentBalance?.overage_allowed,
			max_purchase: parentBalance?.max_purchase,
			reset: parentBalance?.reset,
			plan_id: parentBalance?.plan_id,
		});
	});

	test("check-breakdown1: should have correct v1 response", async () => {
		const res = (await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV1;

		const breakdownItem = res.breakdown?.[0];
		expect(breakdownItem).toBeDefined();
		expect(breakdownItem).toMatchObject({
			included_usage: monthlyMessages.included_usage,
			balance: res.balance,
			usage: 0,
			interval: monthlyMessages.interval,
		});
	});

	test("check-breakdown1: unlimited feature v2 should have breakdown inheriting parent fields", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		})) as unknown as CheckResponseV2;

		const parentBalance = res.balance;
		expect(parentBalance?.unlimited).toBe(true);

		const breakdownItem = res.balance?.breakdown?.[0];
		expect(breakdownItem).toBeDefined();

		// Breakdown should inherit parent's numeric fields
		expect(breakdownItem).toMatchObject({
			granted_balance: parentBalance?.granted_balance,
			purchased_balance: parentBalance?.purchased_balance,
			current_balance: parentBalance?.current_balance,
			usage: parentBalance?.usage,
			overage_allowed: parentBalance?.overage_allowed,
			max_purchase: parentBalance?.max_purchase,
			reset: parentBalance?.reset,
			plan_id: parentBalance?.plan_id,
		});
	});

	test("check-breakdown1: boolean feature v2 should have breakdown inheriting parent fields", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		})) as unknown as CheckResponseV2;

		const parentBalance = res.balance;
		expect(parentBalance).toBeDefined();

		const breakdownItem = res.balance?.breakdown?.[0];
		expect(breakdownItem).toBeDefined();

		// Breakdown should inherit parent's fields (all zeros for boolean)
		expect(breakdownItem).toMatchObject({
			granted_balance: parentBalance?.granted_balance,
			purchased_balance: parentBalance?.purchased_balance,
			current_balance: parentBalance?.current_balance,
			usage: parentBalance?.usage,
			overage_allowed: parentBalance?.overage_allowed,
			max_purchase: parentBalance?.max_purchase,
			reset: parentBalance?.reset,
			plan_id: parentBalance?.plan_id,
		});
	});

	test("check-breakdown1: unlimited feature v1 should have breakdown inheriting parent fields", async () => {
		const res = (await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		})) as unknown as CheckResponseV1;

		expect(res.unlimited).toBe(true);
		const breakdownItem = res.breakdown?.[0];
		expect(breakdownItem).toBeDefined();

		// Breakdown should inherit parent's fields
		expect(breakdownItem).toMatchObject({
			balance: res.balance,
			usage: res.usage,
			included_usage: res.included_usage,
			interval: res.interval,
			interval_count: res.interval_count,
			next_reset_at: res.next_reset_at,
			overage_allowed: res.overage_allowed,
		});
	});

	test("check-breakdown1: boolean feature v1 should have breakdown inheriting parent fields", async () => {
		const res = (await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		})) as unknown as CheckResponseV1;

		const breakdownItem = res.breakdown?.[0];
		expect(breakdownItem).toBeDefined();

		// Breakdown should inherit parent's fields
		expect(breakdownItem).toMatchObject({
			balance: res.balance,
			usage: res.usage,
			included_usage: res.included_usage,
			interval: res.interval,
			interval_count: res.interval_count,
			next_reset_at: res.next_reset_at,
			overage_allowed: res.overage_allowed,
		});
	});

	test("check-breakdown1: lifetime words v2 should have breakdown inheriting parent fields", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Words,
		})) as unknown as CheckResponseV2;

		const parentBalance = res.balance;
		expect(parentBalance).toBeDefined();

		const breakdownItem = res.balance?.breakdown?.[0];
		expect(breakdownItem).toBeDefined();

		// Breakdown should inherit parent's fields
		expect(breakdownItem).toMatchObject({
			granted_balance: parentBalance?.granted_balance,
			purchased_balance: parentBalance?.purchased_balance,
			current_balance: parentBalance?.current_balance,
			usage: parentBalance?.usage,
			overage_allowed: parentBalance?.overage_allowed,
			max_purchase: parentBalance?.max_purchase,
			reset: parentBalance?.reset,
			plan_id: parentBalance?.plan_id,
		});
	});

	test("check-breakdown1: lifetime words v1 should have breakdown inheriting parent fields", async () => {
		const res = (await autumnV1.check<CheckResponseV1>({
			customer_id: customerId,
			feature_id: TestFeature.Words,
		})) as unknown as CheckResponseV1;

		const breakdownItem = res.breakdown?.[0];
		expect(breakdownItem).toBeDefined();

		// Breakdown should inherit parent's fields
		expect(breakdownItem).toMatchObject({
			balance: res.balance,
			usage: res.usage,
			included_usage: res.included_usage,
			interval: res.interval,
			interval_count: res.interval_count,
			next_reset_at: res.next_reset_at,
			overage_allowed: res.overage_allowed,
		});
	});
});
