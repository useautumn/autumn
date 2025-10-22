import { beforeAll, describe, test } from "bun:test";
import {
	type AppEnv,
	type Customer,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectDowngradeCorrect } from "tests/utils/expectUtils/expectScheduleUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "downgrade3";

const free = constructProduct({
	items: [
		constructFeatureItem({
			feature_id: TestFeature.Words,
			included_usage: 100,
		}),
	],
	type: "free",
	isDefault: false,
});

const pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const premium = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing downgrade: premium -> pro -> free -> pro -> premium`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let customer: Customer;
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		stripeCli = ctx.stripeCli;

		const { testClockId: testClockId1, customer: customer_ } =
			await initCustomerV3({
				ctx,
				customerId,
				customerData: {},
				attachPm: "success",
				withTestClock: true,
			});

		await initProductsV0({
			ctx,
			products: [free, pro, premium],
			prefix: testCase,
		});

		testClockId = testClockId1!;
		customer = customer_!;
	});

	test("should attach premium product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
		});
	});

	// let nextCycle = Date.now();
	let preview = null;
	test("should downgrade to pro", async () => {
		const { preview: preview_ } = await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: premium,
			newProduct: pro,
			stripeCli,
			db,
			org,
			env,
		});

		preview = preview_;
	});

	test("should downgrade to free", async () => {
		const { preview: preview_ } = await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: premium,
			newProduct: free,
			stripeCli,
			db,
			org,
			env,
		});

		preview = preview_;
	});

	test("should change downgrade to pro", async () => {
		const { preview: preview_ } = await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: premium,
			newProduct: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});

	test("should renew premium", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: premium,
		});
	});
});
