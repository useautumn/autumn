import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	BillingInterval,
	ProductItemInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	expectProductAttached,
	expectProductNotAttached,
} from "@tests/utils/expectUtils/expectProductAttached";
import { completeInvoiceConfirmation } from "@tests/utils/stripeUtils/completeInvoiceConfirmation";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachAuthenticatePaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			interval: ProductItemInterval.Month,
			rolloverConfig: {
				max: null,
				length: 1,
				duration: RolloverExpiryDurationType.Forever,
			},
		}),
	],
});
const monthlyAddOn = constructRawProduct({
	id: "monthly_add_on",
	isAddOn: true,

	items: [
		constructPriceItem({
			price: 10,
			interval: BillingInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
});

describe(`${chalk.yellowBright("invoice-action-required4: Testing invoice action required for merging subscription")}`, () => {
	const customerId = "invoice-action-required4";
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
			products: [pro, monthlyAddOn],
			prefix: customerId,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await attachAuthenticatePaymentMethod({
			ctx,
			customerId,
		});
	});

	let checkoutUrl: string;
	test("should attach monthly add on and get invoice URL:", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: monthlyAddOn.id,
		});
		expect(res.checkout_url).toBeDefined();
		checkoutUrl = res.checkout_url;

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
		});

		expectProductNotAttached({
			customer,
			productId: monthlyAddOn.id,
		});

		await expectSubToBeCorrect({
			customerId,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should complete invoice and have monthly add on product attached", async () => {
		await completeInvoiceConfirmation({
			url: checkoutUrl,
		});
		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: monthlyAddOn,
		});
		expectProductAttached({
			customer,
			product: pro,
		});

		await expectSubToBeCorrect({
			customerId,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	// test("should create a subscription with prepaid and prorated", async () => {
	// 	await autumn.attach({
	// 		customer_id: customerId,
	// 		product_id: oneOff2.id,
	// 	});

	// 	await autumn.products.update(oneOff2.id, {
	// 		items: replaceItems({
	// 			items: oneOff2.items,
	// 			featureId: TestFeature.Messages,
	// 			newItem: constructFeatureItem({
	// 				featureId: TestFeature.Messages,
	// 				includedUsage: 30,
	// 			}),
	// 		}),
	// 	});

	// 	await autumn.attach({
	// 		customer_id: customerId,
	// 		product_id: oneOff2.id,
	// 	});
	// });
});
