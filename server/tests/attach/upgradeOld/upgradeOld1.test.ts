import { beforeAll, describe, expect, test } from "bun:test";
import {
	BillingInterval,
	FreeTrialDuration,
	ProductItemInterval,
} from "@autumn/shared";
import chalk from "chalk";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "upgradeOld1";

const proWithTrialProduct = constructProduct({
	type: "pro",
	excludeBase: true,
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
		constructPriceItem({
			price: 2000,
			interval: BillingInterval.Month,
		}),
	],
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: true,
		card_required: true,
	},
});

const premiumProduct = constructProduct({
	type: "premium",
	excludeBase: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 5000,
			interval: BillingInterval.Month,
		}),
	],
});

describe(`${chalk.yellowBright(
	"upgradeOld1: Testing upgrade (trial to paid)",
)}`, () => {
	const customerId = testCase;
	let testClockId: string;
	let stripeCli: Stripe;

	const autumn = new AutumnInt({
		secretKey: ctx.orgSecretKey,
	});

	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: "0.1",
	});

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [proWithTrialProduct, premiumProduct],
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

	test("should attach pro with trial", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: proWithTrialProduct.id,
		});
	});

	test("should attach premium", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 3).getTime(),
			waitForSeconds: 10,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premiumProduct.id,
		});
	});

	test("should check product, ents and invoices", async () => {
		const res = await autumnV1.customers.get(customerId);
		expectCustomerV0Correct({
			sent: premiumProduct,
			cusRes: res,
		});

		const invoices = res.invoices;

		expect(invoices[0].total).toBe(5000);
	});
});
