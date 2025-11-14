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
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
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

const wordsUsage = 300000;
const ops = [
	{
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
];

const testCase = "cancel2";
describe(`${chalk.yellowBright("cancel2: Testing cancel at period end (with usage)")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [premium],
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
	});

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

	test("should run operations", async () => {
		await autumn.entities.create(customerId, entities);

		for (let index = 0; index < ops.length; index++) {
			const op = ops[index];
			try {
				await attachAndExpectCorrect({
					autumn,
					customerId,
					product: op.product,
					stripeCli,
					db,
					org,
					env,
				});
			} catch (error) {
				console.log(`Operation failed: ${op.product.id}, index: ${index}`);
				throw error;
			}
		}
	});

	test("should track usage cancel, advance test clock and have correct invoice", async () => {
		const cus1 = await autumn.customers.get(customerId);
		const prod = cus1.products.find((p) => p.id === premium.id);
		const proration = {
			start: prod?.current_period_start || Date.now(),
			end: prod?.current_period_end || Date.now(),
		};

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: wordsUsage,
		});

		await autumn.cancel({
			customer_id: customerId,
			product_id: premium.id,
			cancel_immediately: false,
		});

		await advanceToNextInvoice({
			stripeCli,
			testClockId,
		});

		const wordsAmount = await getExpectedInvoiceTotal({
			db,
			org,
			env,
			onlyIncludeArrear: true,
			usage: [
				{
					featureId: TestFeature.Words,
					value: wordsUsage,
				},
			],
			stripeCli,
			customerId,
			productId: premium.id,
			expectExpired: true,
		});

		const cus = await autumn.customers.get(customerId);
		const prods = cus.products.filter((p) => p.group === premium.group);
		expect(prods.length).toBe(0);

		expect(cus.invoices.length).toBe(2);
		expect(cus.invoices[0].total).toBe(wordsAmount);
	});
});
