import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiBalanceBreakdown,
	ApiVersion,
	type CheckResponseV0,
	type CheckResponseV1,
	type CheckResponseV2,
	type LimitedItem,
	ResetInterval,
	SuccessCode,
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

const monthlyMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	price: 0.5,
	includedUsage: 100,
}) as LimitedItem;

const lifetimeMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	interval: null,
	includedUsage: 1000,
}) as LimitedItem;

const proProd = constructProduct({
	type: "pro",
	isDefault: false,
	items: [monthlyMessages, lifetimeMessages],
});

const testCase = "check6";

describe(`${chalk.yellowBright("check6: test /check on feature with multiple balances (one off + monthly)")}`, () => {
	const customerId = "check6";
	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [proProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});
	});

	test("v2 response", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const expectedLifetimeBreadown: ApiBalanceBreakdown = {
			granted_balance: 1000,
			purchased_balance: 0,
			current_balance: 1000,
			usage: 0,
			max_purchase: null,
			overage_allowed: false,
			reset: {
				interval: ResetInterval.OneOff,
				resets_at: null,
			},
		};

		const expectedMonthlyBreadown = {
			granted_balance: 100,
			purchased_balance: 0,
			current_balance: 100,
			usage: 0,
			max_purchase: null,
			reset: {
				interval: ResetInterval.Month,
			},
		};

		const actualMonthlyBreakdown = res.balance?.breakdown?.[0];
		const actualLifetimeBreakdown = res.balance?.breakdown?.[1];

		expect(actualMonthlyBreakdown).toMatchObject(expectedMonthlyBreadown);
		expect(actualLifetimeBreakdown).toMatchObject(expectedLifetimeBreadown);
		expect(actualMonthlyBreakdown?.reset?.resets_at).toBeDefined();

		expect(res).toMatchObject({
			allowed: true,
			customer_id: customerId,
			required_balance: 1,
			balance: {
				feature_id: TestFeature.Messages,
				unlimited: false,
				granted_balance:
					monthlyMessages.included_usage + lifetimeMessages.included_usage,
				purchased_balance: 0,
				current_balance:
					monthlyMessages.included_usage + lifetimeMessages.included_usage,
				usage: 0,
				max_purchase: null,
				overage_allowed: true,
				reset: {
					interval: "multiple",
					resets_at: null,
				},
			},
		});
	});

	test("v1 response", async () => {
		const res = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV1;

		const totalIncludedUsage =
			monthlyMessages.included_usage + lifetimeMessages.included_usage;

		const lifetimeBreakdown = {
			balance: lifetimeMessages.included_usage,
			included_usage: lifetimeMessages.included_usage,
			interval: "lifetime",
			interval_count: 1,
			next_reset_at: null,
			usage: 0,
		};

		const monthlyBreakdown = {
			balance: monthlyMessages.included_usage,
			included_usage: monthlyMessages.included_usage,
			interval: "month",
			interval_count: 1,
			usage: 0,
		};

		const expectedRes = {
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Messages as string,
			required_balance: 1,
			code: SuccessCode.FeatureFound,
			unlimited: false,
			balance: totalIncludedUsage,
			interval: "multiple",
			interval_count: null,
			usage: 0,
			included_usage: totalIncludedUsage,
			overage_allowed: true,
			// breakdown: [monthlyBreakdown, lifetimeBreakdown],
		};

		expect(res).toMatchObject(expectedRes);
		expect(res.breakdown).toHaveLength(2);
		expect(res.breakdown?.[0]).toMatchObject(monthlyBreakdown);
		expect(res.breakdown?.[1]).toMatchObject(lifetimeBreakdown);
	});

	test("v0 response", async () => {
		const res = (await autumnV0.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV0;

		expect(res.allowed).toBe(true);
		expect(res.balances).toBeDefined();
		expect(res.balances).toHaveLength(1);
		expect(res.balances[0]).toMatchObject({
			balance: monthlyMessages.included_usage + lifetimeMessages.included_usage,
			feature_id: TestFeature.Messages,
			required: null,
			unlimited: false,
			usage_allowed: true,
		});
	});
});
