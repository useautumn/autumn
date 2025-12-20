import { beforeAll, describe, expect, it } from "bun:test";
import { ApiVersion, SuccessCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../../../merged/mergeUtils/expectSubCorrect";

const pro = constructProduct({
	type: "pro",

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
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

const oneOff = constructProduct({
	type: "one_off",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const testCase = "new-subscription-action-required1";

describe(`${chalk.yellowBright("new-subscription-action-required1: new subscription, invoice action required (payment failed)")}`, () => {
	const customerId = "new-subscription-action-required1";

	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "fail",
		});

		await initProductsV0({
			ctx,
			products: [pro, premium, oneOff],
			prefix: testCase,
		});
	});

	it("should call attach and get invoice action required", async () => {
		const attachRes = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(attachRes.code).toBe(SuccessCode.InvoiceActionRequired);
		expect(attachRes.checkout_url).toBeDefined();
		expect(attachRes.checkout_url).toContain("invoice.stripe.com");
		expect(attachRes.message).toBe("Payment action required");

		await completeInvoiceCheckout({
			url: attachRes.checkout_url,
		});
	});

	it("should have attached product after completing invoice action required", async () => {
		const customer = await autumnV1.customers.get(customerId);
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
	});
});
