// PREPAID WITH DOWNGRADE (SCHEDULED...)

import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceToNextInvoice } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
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

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, premium],
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

		testClockId = testClockId1!;
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

	it("should run operations", async () => {
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

	it("should have correct products after update", async () => {
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
