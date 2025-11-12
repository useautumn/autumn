import { beforeAll, describe, test } from "bun:test";
import {
	type AppEnv,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearProratedItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",

	items: [
		// constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 100 }),
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			includedUsage: 1,
			pricePerUnit: 10,
			config: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.Prorate,
			},
		}),
	],
});
const premium = constructProduct({
	type: "premium",

	items: [
		// constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 100 }),
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			includedUsage: 1,
			pricePerUnit: 10,
			config: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.Prorate,
			},
		}),
	],
});

describe(`${chalk.yellowBright("temp: Testing add ons")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

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
			prefix: customerId,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	// test("should cancel one add on", async () => {
	// 	await autumn.cancel({
	// 		customer_id: customerId,
	// 		product_id: addOn.id,
	// 	});

	// 	await expectSubToBeCorrect({
	// 		customerId,
	// 		db,
	// 		org,
	// 		env,
	// 	});
	// });
});
