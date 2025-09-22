import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	APIVersion,
	AppEnv,
	Customer,
	OnDecrease,
	OnIncrease,
	Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { addHours, addMonths, addWeeks } from "date-fns";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { expect } from "chai";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

const testCase = "prepaid5";

export let prepaidAddOn = constructProduct({
	type: "pro",
	excludeBase: true,
	id: "topup",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 12.5,
			config: {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.None,
			},
		}),
	],
	isAddOn: true,
});

export let pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 250,
		}),
	],
});
export let premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
});

describe(`${chalk.yellowBright(`attach/${testCase}: prepaid add on, with entities`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	let curUnix = new Date().getTime();
	let customer: Customer;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const res = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
			withTestClock: false,
		});

		addPrefixToProducts({
			products: [pro, premium, prepaidAddOn],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium, prepaidAddOn],
			db,
			orgId: org.id,
			env,
		});

		customer = res.customer;
		// testClockId = res.testClockId!;
	});

	const entity1Id = "1";
	const entity2Id = "2";
	const entities = [
		{
			id: entity1Id,
			name: "entity1",
			feature_id: TestFeature.Users,
		},
		{
			id: entity2Id,
			name: "entity2",
			feature_id: TestFeature.Users,
		},
	];

	it("should attach pro product to entity1", async function () {
		await autumn.entities.create(customerId, entities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity1Id,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity1Id,
			product: prepaidAddOn,
			otherProducts: [pro],
			stripeCli,
			db,
			org,
			env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 100,
				},
			],
			numSubs: 2,
		});
	});

	const oldEntity2Quantity = 300;
	it("should advance test clock and attach top up to entity2", async function () {
		// await advanceTestClock({
		//   stripeCli,
		//   testClockId,
		//   advanceTo: addWeeks(new Date(), 2).getTime(),
		//   waitForSeconds: 10,
		// });

		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity2Id,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			numSubs: 3,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity2Id,
			product: prepaidAddOn,
			otherProducts: [premium],
			stripeCli,
			db,
			org,
			env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: oldEntity2Quantity,
				},
			],
			numSubs: 4,
		});
	});

	it("should increase prepaid add on quantity for entity1", async function () {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity1Id,
			product: prepaidAddOn,
			otherProducts: [pro],
			stripeCli,
			db,
			org,
			env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 200,
				},
			],
			numSubs: 4,
			waitForInvoice: 10000,
		});
	});

	const newEntity2Quantity = 200;
	it("should decrease prepaid add on quantity for entity2", async function () {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			entityId: entity2Id,
			product: prepaidAddOn,
			otherProducts: [premium],
			stripeCli,
			db,
			org,
			env,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: newEntity2Quantity,
				},
			],
			numSubs: 4,
			waitForInvoice: 5000,
		});

		const entity2 = await autumn.entities.get(customerId, entity2Id);
		expect(entity2.invoices.length).to.equal(2);
		let creditProd = entity2.products.find((p: any) => p.id == prepaidAddOn.id);
		expect(creditProd).to.exist;
		const messagesItem = creditProd!.items.find(
			(i: any) => i.feature_id == TestFeature.Messages,
		);

		expect(messagesItem).to.exist;
		expect(messagesItem.quantity).to.equal(oldEntity2Quantity);
		expect(messagesItem.next_cycle_quantity).to.equal(newEntity2Quantity);
	});

	return;
});
