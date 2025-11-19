import { beforeAll, describe, expect, test } from "bun:test";
import { ProductItemInterval } from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { getSubsFromCusId } from "@tests/utils/expectUtils/expectSubUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Inline product definitions for downgrade7 test
const proProduct = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Admin,
			unlimited: true,
		}),
	],
});

const premiumProduct = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			interval: ProductItemInterval.Month,
		}),
	],
});

const testCase = "downgrade7";
describe(`${chalk.yellowBright(`${testCase}: testing expire scheduled product`)}`, () => {
	const customerId = testCase;

	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		// Initialize products for this test
		await initProductsV0({
			ctx,
			products: [proProduct, premiumProduct],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	// 2. Get premium
	test("should attach premium, then attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: premiumProduct.id,
		});

		await AutumnCli.attach({
			customerId: customerId,
			productId: proProduct.id,
		});
	});

	test("should expire scheduled product (pro)", async () => {
		// const cusProduct = await findCusProductById({
		//   db: this.db,
		//   internalCustomerId: customer.internal_id,
		//   productId: proProduct.id,
		// });

		// expect(cusProduct).to.exist;
		await autumn.cancel({
			customer_id: customerId,
			product_id: proProduct.id,
			cancel_immediately: true,
		});
		// await AutumnCli.expire(cusProduct!.id);
	});

	test("should have correct product and entitlements (premium)", async () => {
		// Check that free is attached
		const res = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({
			sent: premiumProduct,
			cusRes: res,
		});

		const { subs } = await getSubsFromCusId({
			stripeCli,
			customerId: customerId,
			productId: premiumProduct.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
		expect(subs).toHaveLength(1);
		expect(subs[0].canceled_at).toBe(null);
	});
});
