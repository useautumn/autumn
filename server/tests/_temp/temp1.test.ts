import { beforeAll, describe, test } from "bun:test";
import { FreeTrialDuration, LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",

	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 100 }),
	],
	freeTrial: {
		length: 365,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: true,
	},
});

describe(`${chalk.yellowBright("temp: Testing add ons")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let testClockId: string;
	beforeAll(async () => {
		const result = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: customerId,
		});

		testClockId = result.testClockId!;
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
