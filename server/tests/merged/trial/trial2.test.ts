import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	AttachBranch,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import { addDays } from "date-fns";
import { Decimal } from "decimal.js";
import type { Stripe } from "stripe";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Pro Trial
// Trial Finishes
// Premium Trial

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
	trial: true,
});

const ops = [
	{
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Trialing }],
	},
	// {
	//   entityId: "2",
	//   product: premium,
	//   results: [{ product: premium, status: CusProductStatus.Active }],
	// },
];

const testCase = "trial2";
describe(`${chalk.yellowBright("trial2: Testing main trial branch, upgrade from pro trial -> trial finished -> premium trial")}`, () => {
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
			products: [pro, premium],
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

	test("should attach first trial", async () => {
		for (const op of ops) {
			await attachAndExpectCorrect({
				autumn,
				customerId,
				product: op.product,
				stripeCli,
				db,
				org,
				env,
			});
		}

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Trialing,
		});
	});

	test("should advance test clock to past trial ends and attach premium", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 8).getTime(),
		});

		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: premium.id,
		});

		const checkoutRes = await autumn.checkout({
			customer_id: customerId,
			product_id: premium.id,
		});

		expect(attachPreview?.branch).toBe(AttachBranch.Upgrade);

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		await timeout(5000);

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: premium,
			status: CusProductStatus.Trialing,
		});
		const product = customer.products.find((p) => p.id === premium.id)!;
		expect(product.current_period_end).toBeDefined();
		expect(
			Math.abs(product.current_period_end! - addDays(curUnix, 7).getTime()),
		).toBeLessThanOrEqual(
			1000 * 60 * 30, // 30 minutes
		);

		expect(customer.invoices[0].total).toBe(
			new Decimal(checkoutRes.total).toDP(2).toNumber(),
		);

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			shouldBeTrialing: true,
		});
	});
});
