import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceToNextInvoice } from "../utils/testAttachUtils/testAttachUtils.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",

	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 100 }),
	],
});

describe(`${chalk.yellowBright("temp: Testing add ons")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let testClockId: string;
	beforeAll(async () => {
		try {
			await autumn.customers.delete(customerId);
		} catch {}

		await Promise.all([
			autumn.customers.create({
				id: customerId,
				name: customerId,
				email: `${customerId}@example.com`,
			}),
			autumn.customers.create({
				id: customerId,
				name: customerId,
				email: `${customerId}@example.com`,
			}),
		]);
		// const result = await initCustomerV3({
		// 	ctx,
		// 	customerId,
		// 	customerData: {},
		// 	attachPm: "fail",
		// 	withTestClock: true,
		// });

		// await initProductsV0({
		// 	ctx,
		// 	products: [pro],
		// 	prefix: customerId,
		// });

		// testClockId = result.testClockId!;
	});
	return;

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			enable_product_immediately: true,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
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
