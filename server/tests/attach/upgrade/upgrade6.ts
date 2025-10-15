import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectSubItemsCorrect } from "tests/utils/expectUtils/expectSubUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
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
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "upgrade6";

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

describe(`${chalk.yellowBright(`${testCase}: Testing failed upgrades`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

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
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	it("should attach pro product", async () => {
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
	it("should upgrade to premium product and fail", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: usage,
		});
		await timeout(4000);

		const cus = await CusService.get({
			db,
			orgId: org.id,
			idOrInternalId: customerId,
			env,
		});

		await attachFailedPaymentMethod({ stripeCli, customer: cus! });
		await timeout(2000);

		await expectAutumnError({
			func: async () => {
				await attachAndExpectCorrect({
					autumn,
					customerId,
					product: premium,
					stripeCli,
					db,
					org,
					env,
				});
			},
			errMessage: "Failed to update subscription. Your card was declined.",
		});

		await timeout(4000);
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
});
