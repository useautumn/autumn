import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
		}),
		constructPrepaidItem({
			isOneOff: true,
			featureId: TestFeature.Users,
			billingUnits: 1,
			price: 100,
		}),
	],
	isAnnual: true,
	type: "pro",
});

const testCase = "others8";

describe(`${chalk.yellowBright(`${testCase}: Testing annual pro with one off prepaid`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});
	});

	test("should attach annual pro product with one off prepaid", async () => {
		const options = [
			{
				feature_id: TestFeature.Users,
				quantity: 1,
			},
		];

		const preview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: pro.id,
			options,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options,
		});

		console.log(preview);

		const customer = await autumn.customers.get(customerId);

		const invoice = customer.invoices[0];
		// expect(preview.total).toBe(invoice.total);
		expect(invoice.total).toBe(
			getBasePrice({ product: pro }) + options[0].quantity * 100,
		);
	});
});
