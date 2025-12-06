import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { expectSubItemsCorrect } from "@tests/utils/expectUtils/expectSubUtils.js";
import { completeInvoiceConfirmation } from "@tests/utils/stripeUtils/completeInvoiceConfirmation.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachAuthenticatePaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../../merged/mergeUtils/expectSubCorrect";

const testCase = "invoice-action-required4";

const pro = constructProduct({
	type: "pro",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 200,
		}),
	],
});

const billingUnits = 100;
const addOn = constructRawProduct({
	id: "addOn",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Credits,
			billingUnits,
			price: 10,
		}),
	],
	isAddOn: true,
});

describe(`${chalk.yellowBright(`${testCase}: Testing add-on subscription merge with 3DS invoice action required`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, addOn],
			prefix: testCase,
		});
	});

	test("should attach pro product", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(res.code).toBeDefined();

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
		});

		await expectSubItemsCorrect({
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	let checkoutUrl: string;
	test("should attach add-on and get checkout_url due to 3DS", async () => {
		// Attach authenticate payment method to trigger 3DS
		await attachAuthenticatePaymentMethod({
			ctx,
			customerId,
		});

		const res = await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
			options: [
				{
					feature_id: TestFeature.Credits,
					quantity: 100,
				},
			],
		});

		expect(res.checkout_url).toBeDefined();
		checkoutUrl = res.checkout_url;

		// Customer should still only have pro product attached
		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Add-on should NOT be attached yet
		expect(
			customer.products.find((p: { id: string }) => p.id === addOn.id),
		).toBeUndefined();
	});

	test("should complete invoice action required and have add-on product attached", async () => {
		await completeInvoiceConfirmation({
			url: checkoutUrl,
		});

		const customer = await autumn.customers.get(customerId);

		// Pro product should still be attached
		expectProductAttached({
			customer,
			product: pro,
		});

		// Add-on product should now be attached
		expectProductAttached({
			customer,
			product: addOn,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Verify invoice is paid
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});

		expectProductAttached({
			customer: nonCachedCustomer,
			product: pro,
		});

		expectProductAttached({
			customer: nonCachedCustomer,
			product: addOn,
		});
	});
});
