import { beforeAll, describe, test } from "bun:test";
import {
	BillingInterval,
	FreeTrialDuration,
	ProductItemInterval,
} from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "upgradeOld2";

const proProduct = constructProduct({
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

describe(`${chalk.yellowBright(
	"upgradeOld2: Testing upgrade (paid to trial)",
)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt();

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [proProduct, premiumWithTrialProduct],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: proProduct.id,
		});
	});

	test("should attach premium with trial and have trial", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: premiumWithTrialProduct.id,
		});
	});
});
