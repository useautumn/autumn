import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { attachFailedPaymentMethod } from "../../src/external/stripe/stripeCusUtils.js";
import { CusService } from "../../src/internal/customers/CusService.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",

	items: [
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 10,
			includedUsage: 0,
		}),
	],
});

describe(`${chalk.yellowBright("temp: Testing pay per use")}`, () => {
	const customerId = "temp2";
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

		// await advanceToNextInvoice({
		// 	stripeCli: ctx.stripeCli,
		// 	testClockId,
		// });

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		await attachFailedPaymentMethod({
			stripeCli: ctx.stripeCli,
			customer: customer!,
		});

		// await autumn.track({
		// 	customer_id: customerId,
		// 	feature_id: TestFeature.Users,
		// 	value: 1,
		// });

		await autumn.entities.create(customerId, [
			{
				id: "1",
				name: "Entity 1",
				feature_id: TestFeature.Users,
			},
		]);
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
