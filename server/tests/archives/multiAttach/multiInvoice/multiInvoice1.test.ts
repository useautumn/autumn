import { beforeAll, describe, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectMultiAttachCorrect } from "@tests/utils/expectUtils/expectMultiAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const premium = constructProduct({
	id: "premium",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 200 }),
	],
	type: "premium",
	trial: true,
});

const pro = constructProduct({
	id: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 300,
		}),
	],
	type: "pro",
	trial: true,
});

const testCase = "multiInvoice1";
describe(`${chalk.yellowBright("multiInvoice1: Testing multi attach through invoice flow")}`, () => {
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
			withTestClock: true,
		});

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		testClockId = res.testClockId!;
	});

	test("should run multi attach through invoice checkout flow", async () => {
		// Old product-level quantity multipliers (3/3) dropped: no /billing.multi_attach equivalent
		await expectMultiAttachCorrect({
			customerId,
			plans: [{ plan_id: pro.id }, { plan_id: premium.id }],
			results: [
				{ product: pro, status: CusProductStatus.Trialing },
				{ product: premium, status: CusProductStatus.Trialing },
			],
			invoiceMode: {
				enabled: true,
				enable_plan_immediately: true,
			},
			db,
			org,
			env,
		});
	});

	// Old contract updated product-level quantities mid-trial; /billing.multi_attach has no quantity multiplier
	test.todo("should update premium & pro while trialing", () => {});
});
