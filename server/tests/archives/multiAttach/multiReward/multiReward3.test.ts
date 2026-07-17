import { beforeAll, describe, test } from "bun:test";
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
		// Old product-level quantity multipliers (3/3) dropped: no /billing.multi_attach equivalent
		await expectMultiAttachCorrect({
			customerId,
			plans: [{ plan_id: proTrial.id }, { plan_id: premiumTrial.id }],
			results: [
				{ product: proTrial, status: CusProductStatus.Trialing },
				{ product: premiumTrial, status: CusProductStatus.Trialing },
			],
			db,
			org,
			env,
			discounts: [
				{ reward_id: proReward.id },
				{ reward_id: premiumReward.id },
			],
			expectedRewards: [proReward.id, premiumReward.id],
		});
	});

	// Old contract re-attached with a new product-level quantity (5); /billing.multi_attach has no quantity multiplier
	test.todo("should advance clock and update pro quantity", () => {});

	// Asserted quantity-multiplied trial-end invoice math (3x base * 20%) from the removed quantity model
	test.todo("should advance to trial end and have correct quantity", () => {});
});
