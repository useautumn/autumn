import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus, ProductItemInterval } from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Inline product definitions for downgrade5 test
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

const testCase = "downgrade5";
describe(`${chalk.yellowBright(`${testCase}: testing basic downgrade (paid to paid)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt();
	let testClockId: string;
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

		const { testClockId: testClockId_ } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId_;
	});

	test("should attach premium", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: premiumProduct.id,
		});
	});

	test("should attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: proProduct.id,
		});
	});

	test("should have correct product and entitlements for scheduled pro", async () => {
		const res = await AutumnCli.getCustomer(customerId);

		expectCustomerV0Correct({
			sent: premiumProduct,
			cusRes: res,
		});

		const { products: resProducts } = res;

		const resPro = resProducts.find(
			(p: any) =>
				p.id === proProduct.id && p.status === CusProductStatus.Scheduled,
		);

		expect(resPro).toBeDefined();
	});

	test("should attach premium and remove scheduled pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: premiumProduct.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		const resPro = res.products.find(
			(p: any) =>
				p.id === proProduct.id && p.status === CusProductStatus.Scheduled,
		);

		expect(resPro).toBeUndefined();

		expectCustomerV0Correct({
			sent: premiumProduct,
			cusRes: res,
		});
	});

	// Advance time 1 month
	test("should attach pro, advance stripe clock and have pro is attached", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: proProduct.id,
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 15,
		});

		const res = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({
			sent: proProduct,
			cusRes: res,
		});
	});
});
