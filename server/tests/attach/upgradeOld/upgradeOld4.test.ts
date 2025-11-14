// TESTING UPGRADES

import { beforeAll, describe, test } from "bun:test";
import {
	BillingInterval,
	type Customer,
	ProductItemInterval,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	attachFailedPaymentMethod,
	attachPmToCus,
} from "@/external/stripe/stripeCusUtils.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "upgradeOld4";

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

describe(`${chalk.yellowBright("upgradeOld4: Testing upgrade from pro -> premium")}`, () => {
	let customer: Customer;
	const customerId = testCase;

	let stripeCli: Stripe;
	const autumn: AutumnInt = new AutumnInt();

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [proProduct, premiumProduct],
			prefix: testCase,
			customerId,
		});

		const { customer: customer_ } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		customer = customer_;
	});

	test("should attach pro (trial)", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: proProduct.id,
		});

		const res = await autumn.customers.get(customerId);
		expectCustomerV0Correct({
			sent: proProduct,
			cusRes: res,
		});
	});

	// 1. Try force checkout...
	test("should attach premium and not be able to force checkout", async () => {
		expectAutumnError({
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: premiumProduct.id,
					force_checkout: true,
				});
			},
		});
	});

	test("should attach premium and not be able to upgrade (without payment method)", async () => {
		await attachFailedPaymentMethod({
			stripeCli: stripeCli,
			customer: customer,
		});

		await expectAutumnError({
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: premiumProduct.id,
					force_checkout: true,
				});
			},
		});
	});

	// Attach payment method
	test("should attach successful payment method", async () => {
		await attachPmToCus({
			db: ctx.db,
			customer: customer,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should attach premium and have correct product and entitlements", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: premiumProduct.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({
			sent: premiumProduct,
			cusRes: res,
		});
	});
});
