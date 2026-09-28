import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expectMultiAttachCorrect } from "@tests/utils/expectUtils/expectMultiAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	multiRewardPremium,
	multiRewardPro,
	premiumReward,
	proReward,
	setupMultiRewardBefore,
} from "./multiRewardUtils.test.js";

const testCase = "multiReward2";
describe(`${chalk.yellowBright("multiReward2: Testing multi attach with rewards -- delete reward and prorate")}`, () => {
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
				product_id: multiRewardPro.id,
				quantity: 3,
				product: multiRewardPro,
				status: CusProductStatus.Active,
			},
			{
				product_id: multiRewardPremium.id,
				quantity: 3,
				product: multiRewardPremium,
				status: CusProductStatus.Active,
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

	test("should delete discounts from subscription and prorate correctly", async () => {
		const fullCus = await CusService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: customerId,
		});

		const cusProduct = fullCus.customer_products.find(
			(cp) => cp.product.id === multiRewardPro.id,
		);
		const sub = await cusProductToSub({ cusProduct, stripeCli });

		await stripeCli.subscriptions.update(sub!.id, {
			discounts: null,
		});
	});

	test("should update pro quantity and have correct checkout amount", async () => {
		const productsList = [
			{
				product_id: multiRewardPro.id,
				quantity: 5,
			},
		];

		const results = [
			{
				product: multiRewardPro,
				quantity: 5,
				status: CusProductStatus.Active,
			},
			{
				product: multiRewardPremium,
				quantity: 3,
				status: CusProductStatus.Active,
			},
		];
		await expectMultiAttachCorrect({
			customerId,
			products: productsList,
			results,
			db,
			org,
			env,
			expectedRewards: [],
		});
	});
	return;

	// it("should advance clock and update premium & growth while trialing", async function () {
	//   const newProducts = [
	//     {
	//       product_id: premium.id,
	//       quantity: 1,
	//     },
	//     {
	//       product_id: growth.id,
	//       quantity: 5,
	//     },
	//   ];

	//   const results = [
	//     {
	//       product: pro,
	//       quantity: 5,
	//       status: CusProductStatus.Trialing,
	//     },
	//     {
	//       product: premium,
	//       quantity: 1,
	//       status: CusProductStatus.Trialing,
	//     },

	//     {
	//       product: growth,
	//       quantity: 5,
	//       status: CusProductStatus.Trialing,
	//     },
	//   ];

	//   await advanceTestClock({
	//     stripeCli,
	//     testClockId,
	//     advanceTo: addDays(new Date(), 3).getTime(),
	//   });

	//   await expectMultiAttachCorrect({
	//     customerId,
	//     products: newProducts,
	//     results,
	//     db,
	//     org,
	//     env,
	//   });
	// });
});
