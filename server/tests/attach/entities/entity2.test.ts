import { beforeAll, describe, test } from "bun:test";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { defaultApiVersion } from "tests/constants.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectInvoiceAfterUsage } from "tests/utils/expectUtils/expectSingleUse/expectUsageInvoice.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "aentity2";

export const proAnnual = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 1500,
		}),
	],
	type: "pro",
	isAnnual: true,
});

describe(`${chalk.yellowBright(`attach/${testCase}: Testing attach pro annual to entity via checkout`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
	let testClockId: string;

	let curUnix = new Date().getTime();

	beforeAll(async () => {
		const result = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
		});

		testClockId = result.testClockId!;

		await initProductsV0({
			ctx,
			products: [proAnnual],
			prefix: testCase,
		});
	});

	const newEntities = [
		{
			id: "1",
			name: "Entity 1",
			feature_id: TestFeature.Users,
		},
	];

	let entityId = newEntities[0].id;
	test("should attach pro annual product to entity 2", async () => {
		await autumn.entities.create(customerId, newEntities);
		entityId = newEntities[0].id;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: proAnnual,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			entityId,
		});
	});

	const usage = 1250130;
	test("should track usage", async () => {
		await autumn.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Words,
			value: usage,
		});
		await timeout(5000);

		const entity = await autumn.entities.get(customerId, entityId);

		expectFeaturesCorrect({
			customer: entity,
			product: proAnnual,
			usage: [
				{
					featureId: TestFeature.Words,
					value: usage,
				},
			],
		});
	});

	test("should have correct invoice after cycle", async () => {
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(curUnix, 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		await expectInvoiceAfterUsage({
			autumn,
			customerId,
			entityId,
			featureId: TestFeature.Words,
			product: proAnnual,
			usage,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			numInvoices: 2,
		});
	});
});
