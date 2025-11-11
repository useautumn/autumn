import { beforeAll, describe, expect, test } from "bun:test";
import type { Customer } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { getSubsFromCusId } from "@tests/utils/expectUtils/expectSubUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	sharedProProduct,
	sharedPremiumProduct,
	initDowngradeSharedProducts,
} from "./sharedProducts.js";

const testCase = "downgrade7";
describe(`${chalk.yellowBright(`${testCase}: testing expire scheduled product`)}`, () => {
	const customerId = testCase;
	let testClockId: string;
	let customer: Customer;
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		// Explicitly ensure shared products exist
		await initDowngradeSharedProducts();

		const { testClockId: testClockId_, customer: customer_ } =
			await initCustomerV3({
				ctx,
				customerId,
				customerData: {},
				attachPm: "success",
				withTestClock: true,
			});

		customer = customer_;
		testClockId = testClockId_;
	});

	// 2. Get premium
	test("should attach premium, then attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedPremiumProduct.id,
		});

		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedProProduct.id,
		});
	});

	test("should expire scheduled product (pro)", async () => {
		// const cusProduct = await findCusProductById({
		//   db: this.db,
		//   internalCustomerId: customer.internal_id,
		//   productId: sharedProProduct.id,
		// });

		// expect(cusProduct).to.exist;
		await autumn.cancel({
			customer_id: customerId,
			product_id: sharedProProduct.id,
			cancel_immediately: true,
		});
		// await AutumnCli.expire(cusProduct!.id);
	});

	test("should have correct product and entitlements (premium)", async () => {
		// Check that free is attached
		const res = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({
			sent: sharedPremiumProduct,
			cusRes: res,
		});

		const { subs } = await getSubsFromCusId({
			stripeCli,
			customerId: customerId,
			productId: sharedPremiumProduct.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
		expect(subs).toHaveLength(1);
		expect(subs[0].canceled_at).toBe(null);
	});
});
