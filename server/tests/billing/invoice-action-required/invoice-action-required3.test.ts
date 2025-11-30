import { beforeAll, describe, expect, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { expectSubItemsCorrect } from "@tests/utils/expectUtils/expectSubUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearItem,
	constructArrearProratedItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

import { completeInvoiceCheckout } from "../../utils/stripeUtils/completeInvoiceCheckout";

const testCase = "invoice-action-required3";

export const pro = constructProduct({
	items: [
		constructArrearItem({ featureId: TestFeature.Words }),
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 20,
		}),
	],
	type: "pro",
});

export const premium = constructProduct({
	items: [
		constructArrearItem({ featureId: TestFeature.Words }),
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 30,
		}),
	],
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing upgrade, failed payment`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	beforeAll(async () => {
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		stripeCli = ctx.stripeCli;

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});

	const usage = 100012;

	let checkoutUrl: string;
	test("should upgrade to premium product and fail", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: usage,
		});

		const cus = await CusService.get({
			db,
			orgId: org.id,
			idOrInternalId: customerId,
			env,
		});

		await attachFailedPaymentMethod({ stripeCli, customer: cus! });
		await timeout(2000);

		const res = await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		checkoutUrl = res.checkout_url;
		expect(res.checkout_url).toBeDefined();

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});

		expectFeaturesCorrect({
			customer,
			product: pro,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});

		await expectSubItemsCorrect({
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});

	test("should complete invoice and have premium product attached", async () => {
		await completeInvoiceCheckout({
			url: checkoutUrl,
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

		await expectSubItemsCorrect({
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
		});
	});
});
