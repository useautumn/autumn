import {
	APIVersion,
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { expectSubToBeCorrect } from "../mergeUtils.test.js";

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
		// otherProducts: [g2Pro],
	},
];

describe(`${chalk.yellowBright("mergedGroup1: Testing products from diff groups")}`, () => {
	const customerId = "mergedGroup1";
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

	let stripeCli: Stripe;
	let _testClockId: string;
	let _curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		await createProducts({
			autumn: autumnJs,
			products: [g1Pro, g2Pro, g1Premium, g2Premium],
			db,
			orgId: org.id,
			env,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		_testClockId = testClockId1!;
	});

	it("should attach pro product", async () => {
		for (const op of ops) {
			await attachAndExpectCorrect({
				autumn,
				customerId,
				product: op.product,
				stripeCli,
				otherProducts: op.otherProducts,
				db,
				org,
				env,
			});

			const customer = await autumn.customers.get(customerId);
			for (const result of op.results) {
				expectProductAttached({
					customer,
					product: result.product,
					status: result.status,
				});
			}
		}
	});

	it("should cancel scheduled product (g1Pro)", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: g1Pro.id,
			cancel_immediately: true,
		});

		await expectSubToBeCorrect({
			customerId,
			db,
			org,
			env,
		});
	});
});
