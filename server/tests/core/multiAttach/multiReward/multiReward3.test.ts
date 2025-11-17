import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { expectMultiAttachCorrect } from "@tests/utils/expectUtils/expectMultiAttach.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addDays } from "date-fns";
import { Decimal } from "decimal.js";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	premiumReward,
	premiumTrial,
	proReward,
	proTrial,
	setupMultiRewardBefore,
} from "./multiRewardUtils.test.js";

const testCase = "multiReward3";
describe(`${chalk.yellowBright("multiReward3: Testing multi attach with rewards -- advance clock and update pro quantity")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
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

		await setupMultiRewardBefore({
			orgId: org.id,
			db,
			env,
		});
	});

	test("should run multi attach through checkout and have correct sub", async () => {
		const productsList = [
			{
				product_id: proTrial.id,
				quantity: 3,
				product: proTrial,
				status: CusProductStatus.Trialing,
			},
			{
				product_id: premiumTrial.id,
				quantity: 3,
				product: premiumTrial,
				status: CusProductStatus.Trialing,
			},
		];
		await expectMultiAttachCorrect({
			customerId,
			products: productsList,
			results: productsList,
			db,
			org,
			env,
			rewards: [proReward.id, premiumReward.id],
			expectedRewards: [proReward.id, premiumReward.id],
		});
	});

	let checkoutRes: any;

	test("should advance clock and update pro quantity", async () => {
		const productsList = [
			{
				product_id: proTrial.id,
				quantity: 5,
				product: proTrial,
				status: CusProductStatus.Trialing,
			},
		];

		const results = [
			{
				product: proTrial,
				quantity: 5,
				status: CusProductStatus.Trialing,
			},
			{
				product: premiumTrial,
				quantity: 3,
				status: CusProductStatus.Trialing,
			},
		];
		const res = await expectMultiAttachCorrect({
			customerId,
			products: productsList,
			results,
			db,
			org,
			env,
			rewards: [proReward.id, premiumReward.id],
			expectedRewards: [proReward.id, premiumReward.id],
		});

		checkoutRes = res.checkoutRes;
	});

	test("should advance to trial end and have correct quantity", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 12).getTime(),
			waitForSeconds: 30,
		});

		await expectSubToBeCorrect({
			customerId,
			db,
			org,
			env,
			// sub: curSub,
			// cusProduct: curMainProduct,
			// results: productsList,
		});

		const customer = await autumn.customers.get(customerId);
		const latestInvoice = customer.invoices[0];

		const checkoutNextCycleTotal = checkoutRes.next_cycle?.total;
		const premiumPrice = new Decimal(getBasePrice({ product: premiumTrial }))
			.mul(3)
			.mul(0.2)
			.toNumber();

		console.log("Premium price: ", premiumPrice);
		console.log("Checkout next cycle total: ", checkoutNextCycleTotal);
		expect(latestInvoice.total).toBe(
			checkoutRes.next_cycle?.total + premiumPrice,
		);
	});
});
