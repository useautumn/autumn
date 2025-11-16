// PREPAID WITH DOWNGRADE (SCHEDULED...)

import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { addPrefixToProducts } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

const billingUnits = 100;
const creditItem = constructPrepaidItem({
	featureId: TestFeature.Credits,
	includedUsage: 100,
	price: 10,
	billingUnits,
	config: {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.ProrateImmediately,
	},
});

const premium = constructProduct({
	id: "premium",
	items: [creditItem],
	type: "premium",
});

const pro = constructProduct({
	id: "pro",
	items: [creditItem],
	type: "pro",
});

const ops = [
	{
		entityId: "1",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: billingUnits * 4,
			},
		],
	},
	{
		entityId: "2",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: billingUnits * 3,
			},
		],
	},

	// Update prepaid quantity (increase)
	{
		entityId: "1",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: billingUnits * 2,
			},
		],
	},
];

const testCase = "mergedPrepaid3";
describe(`${chalk.yellowBright("mergedPrepaid3: Testing merged subs, upgrade 1 & 2 to premium, downgrade 1 to pro")}`, () => {
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
			customerData: {},
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
					entityId: op.entityId,
					options: op.options,
				});
			} catch (error) {
				console.log(
					`Operation failed: ${op.entityId} ${op.product.id}, index: ${index}`,
				);
				throw error;
			}
		}
	});

	test("should have correct products after update", async () => {
		await advanceToNextInvoice({
			stripeCli,
			testClockId,
		});

		const entity1 = await autumn.entities.get(customerId, "1");
		expectProductAttached({
			customer: entity1,
			product: pro,
			entityId: "1",
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});
});
