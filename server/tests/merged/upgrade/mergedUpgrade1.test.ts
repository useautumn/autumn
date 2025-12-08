import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});
const premiumAnnual = constructProduct({
	id: "premiumAnnual",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
	isAnnual: true,
});

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const ops = [
	{
		entityId: "1",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
];

const testCase = "mergedUpgrade1";
describe(`${chalk.yellowBright("mergedUpgrade1: Testing merged subs, upgrade 1 & 2 to pro, add premium 2")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

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

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, premium, premiumAnnual],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,

			attachPm: "success",
			withTestClock: true,
		});

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		testClockId = res.testClockId!;

		await autumn.entities.create(customerId, entities);
	});

	for (let index = 0; index < ops.length; index++) {
		const op = ops[index];
		test(`should attach ${op.product.id} to entity ${op.entityId}`, async () => {
			try {
				await attachAndExpectCorrect({
					autumn,
					customerId,
					product: op.product,
					stripeCli,
					db,
					org,
					env,
					entityId: op.entityId,
				});
			} catch (error) {
				console.log(
					`Operation failed: ${op.entityId} ${op.product.id}, index: ${index}`,
				);
				throw error;
			}
		});
	}

	const entity1Val = 100000;
	const entity2Val = 300000;

	test("should advance test clock and upgrade entity 1 to premium, and have correct invoice", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: entity1Val,
			entity_id: "1",
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: entity2Val,
			entity_id: "2",
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(Date.now(), 2).getTime(),
			waitForSeconds: 30,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			entityId: "1",
		});
	});

	test("should advance to next invoice and have correct invoice", async () => {
		await advanceToNextInvoice({
			stripeCli,
			testClockId,
			withPause: true,
		});

		const expectedTotal = await getExpectedInvoiceTotal({
			org,
			env,
			customerId,
			productId: pro.id,
			stripeCli,
			db,
			onlyIncludeUsage: true,
			usage: [
				{
					featureId: TestFeature.Words,
					value: entity2Val,
				},
			],
		});

		const customer = await autumn.customers.get(customerId);
		const invoice = customer.invoices[0];
		const basePrice =
			getBasePrice({ product: pro }) + getBasePrice({ product: premium });
		expect(invoice.total).toBe(basePrice + expectedTotal);
	});
});
