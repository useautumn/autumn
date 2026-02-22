import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
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

const premium = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 250,
		}),
	],
	type: "premium",
});

const testCase = "checkout6";
describe(`${chalk.yellowBright(`${testCase}: Testing invoice checkout via checkout endpoint`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
		});
	});

	test("should attach pro product via invoice checkout", async () => {
		const res = await autumn.checkout({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
		});

		expect(res.url).toBeDefined();

		await completeInvoiceCheckout({
			url: res.url!,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});

		expectFeaturesCorrect({
			customer,
			product: pro,
		});
	});

	// test("should have no URL returned if try to attach premium (with invoice true)", async () => {
	// 	const res = await autumn.attach({
	// 		customer_id: customerId,
	// 		product_id: premium.id,
	// 		invoice: true,
	// 	});

	// 	expect(res.url).toBeUndefined();
	// });

	test("should attach premium product via invoice enable immediately", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			invoice: true,
			enable_product_immediately: true,
			finalize_invoice: false,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: premium,
		});

		expectFeaturesCorrect({
			customer,
			product: premium,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);
		expect(invoices[0].status).toBe("draft");
		expect(invoices[0].total).toBe(
			getBasePrice({ product: premium }) - getBasePrice({ product: pro }),
		); // proration...
	});
});
