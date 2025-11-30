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
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 200,
			// unlimited: true,
		}),
	],
});

const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

describe(`${chalk.yellowBright("invoice-action-required1: Testing invoice action required")}`, () => {
	const customerId = "invoice-action-required1";
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
			products: [pro, premium],
			prefix: customerId,
		});
	});

	let checkoutUrl: string;
	test("should attach pro product, then upgrade to premium and get checkout_url", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await attachAuthenticatePaymentMethod({
			ctx,
			customerId,
		});

		const res = await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		expect(res.checkout_url).toBeDefined();

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

		checkoutUrl = res.checkout_url;
	});

	test("should complete invoice action required and have premium product attached", async () => {
		await completeInvoiceConfirmation({
			url: checkoutUrl,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: premium,
		});

		await expectSubItemsCorrect({
			customerId,
			product: premium,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		// Cleared cache
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});
		expect(nonCachedCustomer.invoices?.[0].status).toBe("paid");

		expectProductAttached({
			customer: nonCachedCustomer,
			product: premium,
		});
	});
});
