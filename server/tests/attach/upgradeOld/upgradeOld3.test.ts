import { beforeAll, describe, expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
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

const testCase = "upgradeOld3";

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

const premiumWithTrialProduct = constructProduct({
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
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: true,
		card_required: true,
	},
});

describe(`${chalk.yellowBright("upgradeOld3: Testing upgrade (trial to trial)")}`, () => {
	const customerId = testCase;
	let testClockId: string;
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [proWithTrialProduct, premiumWithTrialProduct],
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

		console.log(`   ${chalk.greenBright("Attached pro with trial")}`);
	});

	test("should attach premium with trial", async () => {
		const advanceTo = addDays(new Date(), 3).getTime();

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo,
			waitForSeconds: 10,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premiumWithTrialProduct.id,
		});
	});

	test("should check product and ents", async () => {
		const res = await autumn.customers.get(customerId);
		expectCustomerV0Correct({
			sent: premiumWithTrialProduct,
			cusRes: res,
			status: CusProductStatus.Trialing,
		});

		const invoices = res.invoices;

		expect(invoices![0].total).toBe(0);
	});
});
