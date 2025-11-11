import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

const testCase = "checkout5";
describe(`${chalk.yellowBright(`${testCase}: Testing invoice checkout, no product till paid`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });

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
	});

	test("should attach pro  product", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
		});

		const customer = await autumn.customers.get(customerId);

		const invoice = customer.invoices?.[0];

		expect(invoice).toBeDefined();
		expect(invoice.total).toBe(getBasePrice({ product: pro }));
		expect(invoice.status).toBe("open");

		const product = customer.products.find((p) => p.id === pro.id);
		expect(product).toBeUndefined();

		await completeInvoiceCheckout({
			url: res.checkout_url,
		});

		const customer2 = await autumn.customers.get(customerId);

		const invoice2 = customer2.invoices?.[0];

		expect(customer2.invoices.length).toBe(1);
		expect(invoice2).toBeDefined();
		expect(invoice2.status).toBe("paid");

		expectProductAttached({
			customer: customer2,
			product: pro,
		});

		expectFeaturesCorrect({
			customer: customer2,
			product: pro,
		});
	});
});
