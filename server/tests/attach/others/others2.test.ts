import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "others2";

export const oneOff = constructProduct({
	type: "one_off",
	items: [
		constructPrepaidItem({
			isOneOff: true,
			featureId: TestFeature.Messages,
			price: 8,
			billingUnits: 250,
		}),
	],
});

describe(`${chalk.yellowBright(`${testCase}: Testing one-off`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [oneOff],
			prefix: testCase,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	const options = [
		{
			feature_id: TestFeature.Messages,
			quantity: 500,
		},
	];

	test("should attach one-off product", async () => {
		await attachAndExpectCorrect({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			product: oneOff,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options,
		});
	});

	const options2 = [
		{
			feature_id: TestFeature.Messages,
			quantity: 750,
		},
	];
	test("should be able to attach again", async () => {
		await attachAndExpectCorrect({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			product: oneOff,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			options: options2,
			skipFeatureCheck: true,
		});

		const totalBalance = options[0].quantity + options2[0].quantity;
		const customer = await autumn.customers.get(customerId);

		const balance = customer.features[TestFeature.Messages].balance;
		expect(balance).toBe(totalBalance);
	});

	// Payment failure
	test("should handle payment failure", async () => {
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

		const res = await autumn.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			options,
		});

		expect(res.checkout_url).toBeDefined();
	});
});
