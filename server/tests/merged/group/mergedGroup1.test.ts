import { beforeAll, describe, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const g1Pro = constructProduct({
	id: "mergedGroups1_g1Pro",
	group: "mergedG1_1",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const g1Premium = constructProduct({
	id: "mergedGroups1_g1Premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	group: "mergedG1_1",
	type: "premium",
});

const g2Pro = constructProduct({
	id: "mergedGroups1_g2Pro",
	group: "mergedG1_2",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const g2Premium = constructProduct({
	id: "mergedGroups1_g2Premium",
	group: "mergedG1_2",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

// Ops
const ops = [
	{
		product: g1Pro,
		results: [{ product: g1Pro, status: CusProductStatus.Active }],
	},
	{
		product: g2Pro,
		results: [
			{ product: g1Pro, status: CusProductStatus.Active },
			{ product: g2Pro, status: CusProductStatus.Active },
		],
		otherProducts: [g1Pro],
	},
	{
		product: g1Premium,
		results: [
			{ product: g1Premium, status: CusProductStatus.Active },
			{ product: g2Pro, status: CusProductStatus.Active },
		],
		otherProducts: [g2Pro],
	},
	{
		product: g1Pro,
		results: [
			{ product: g1Premium, status: CusProductStatus.Active },
			{ product: g2Pro, status: CusProductStatus.Active },
			{ product: g1Pro, status: CusProductStatus.Scheduled },
		],
		otherProducts: [g2Pro],
		skipFeatureCheck: true,
	},
];

describe(`${chalk.yellowBright("mergedGroup1: Testing products from diff groups")}`, () => {
	const customerId = "mergedGroup1";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [g1Pro, g2Pro, g1Premium, g2Premium],
			// prefix: customerId,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,

			attachPm: "success",
			withTestClock: true,
		});

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
	});

	for (const op of ops) {
		test(`should attach ${op.product.id}, other products: ${op.otherProducts?.map((p) => p.id).join(", ")}`, async () => {
			await attachAndExpectCorrect({
				autumn,
				customerId,
				product: op.product,
				stripeCli,
				otherProducts: op.otherProducts,
				db,
				org,
				env,
				// skipFeatureCheck: op.skipFeatureCheck,
			});

			const customer = await autumn.customers.get(customerId);
			for (const result of op.results) {
				expectProductAttached({
					customer,
					product: result.product,
					status: result.status,
				});
			}
		});
	}

	// test("should cancel scheduled product (g1Pro)", async () => {
	// 	await autumn.cancel({
	// 		customer_id: customerId,
	// 		product_id: g1Pro.id,
	// 		cancel_immediately: true,
	// 	});

	// 	await expectSubToBeCorrect({
	// 		customerId,
	// 		db,
	// 		org,
	// 		env,
	// 	});
	// });
});
