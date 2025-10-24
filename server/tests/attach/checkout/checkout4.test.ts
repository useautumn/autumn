import { beforeAll, describe, expect, test } from "bun:test";
import { RewardType } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createReward } from "tests/utils/productUtils.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructCoupon,
	constructProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

const reward = constructCoupon({
	id: "checkout4",
	promoCode: "checkout4_code",
	discountType: RewardType.PercentageDiscount,
	discountValue: 50,
});

const testCase = "checkout4";
describe(`${chalk.yellowBright(`${testCase}: Testing attach coupon`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt();

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		await createReward({
			orgId: ctx.org.id,
			env: ctx.env,
			db: ctx.db,
			autumn,
			reward,
			productId: pro.id,
		});
	});

	test("should attach pro and one off product", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			reward: reward.id,
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(10000);

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});

		expect(customer.invoices.length).toBe(1);
		const totalPrice = getBasePrice({ product: pro });
		expect(customer.invoices[0].total).toBe(totalPrice * 0.5);
	});
});
