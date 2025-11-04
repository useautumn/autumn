import {
	type AppEnv,
	BillingInterval,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "updateEnts5";

export const pro = constructRawProduct({
	id: "pro", // Test price is 5/month
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 100,
		}),
		constructPriceItem({
			price: 5,
			interval: BillingInterval.Month,
		}),
	],
});

/**
 * updateEnts5:
 * Testing update entitlements with base price change and payment method updates across multiple entities
 * 1. Create 3 entities and attach pro product (5/month base price) to each
 * 2. Attach failed payment method to customer
 * 3. Try to update each entity to more expensive base price (10/month)
 * 4. Should fail with payment error, not duplicate price error (tests undoSubUpdate rollback)
 */

describe(`${chalk.yellowBright(`${testCase}: Testing update ents with price change and payment method updates`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const entities = [
		{
			id: "1",
			name: "Entity 1",
			feature_id: TestFeature.Users,
		},
		{
			id: "2",
			name: "Entity 2",
			feature_id: TestFeature.Users,
		},
	];

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	it("should create entities and attach pro product to each", async () => {
		await autumn.entities.create(customerId, entities);

		for (const entity of entities) {
			await attachAndExpectCorrect({
				autumn,
				customerId,
				product: pro,
				stripeCli,
				db,
				org,
				env,
				entityId: entity.id,
			});
		}
	});

	it("should attach failed payment method and try to upgrade each entity", async () => {
		const autumnCus = await CusService.get({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
		});

		// Attach failed payment method
		await attachFailedPaymentMethod({
			stripeCli,
			customer: autumnCus!,
		});

		// Create custom items with higher price
		let customItems = pro.items.filter((item) => !nullish(item.feature_id));
		customItems = [
			...customItems,
			constructPriceItem({
				price: 10,
				interval: BillingInterval.Month,
			}),
		];

		// Try to upgrade each entity - should fail with payment error
		for (const entity of entities) {
			try {
				await autumn.attach({
					customer_id: customerId,
					product_id: pro.id,
					is_custom: true,
					items: customItems,
					entity_id: entity.id,
				});

				// If we reach here, the test should fail
				throw new Error("Expected upgrade to fail with payment error");
			} catch (error: any) {
				// Expect payment failure error, not duplicate price error
				expect(error.message).to.include("card");
				expect(error.message).to.not.include("duplicate");
				expect(error.message).to.not.include(
					"can't be added to this Subscription",
				);
			}
		}
	});
});
