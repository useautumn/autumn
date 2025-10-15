import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { TestFeature } from "tests/setup/v2Features.js";
import {
	expectMultiAttachCorrect,
	expectResultsCorrect,
} from "tests/utils/expectUtils/expectMultiAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import {
	addPrefixToProducts,
	getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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

const testCase = "multiAttach3";
describe(`${chalk.yellowBright("multiAttach3: Testing multi attach for trial products transfer to entity, then cancel products on entities...")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({
		version: LegacyVersion.v1_4,
		orgConfig: { entity_product: true },
	});

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

		testClockId = testClockId1;
	});

	it("should run multi attach through checkout and have correct sub", async () => {
		const productsList = [
			{
				product_id: pro.id,
				quantity: 5,
				product: pro,
				status: CusProductStatus.Trialing,
			},
			{
				product_id: premium.id,
				quantity: 3,
				product: premium,
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
		});
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

	const results = [
		{
			product: pro,
			quantity: 5,
			status: CusProductStatus.Trialing,
		},
		{
			product: premium,
			quantity: 3,
			status: CusProductStatus.Trialing,
		},
		{
			product: pro,
			quantity: 1,
			entityId: "2",
			status: CusProductStatus.Trialing,
		},
		{
			product: pro,
			quantity: 1,
			entityId: "2",
			status: CusProductStatus.Trialing,
		},
	];

	it("should transfer to entity and have correct sub", async () => {
		await autumn.entities.create(customerId, entities);

		await autumn.transfer(customerId, {
			to_entity_id: "2",
			product_id: pro.id,
		});
		await autumn.transfer(customerId, {
			to_entity_id: "1",
			product_id: premium.id,
		});

		await expectResultsCorrect({
			autumn,
			customerId,
			results,
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});

	it("should cancel one entity's sub at end of cycle and have correct schedule...", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: "2",
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});

	it("should cancel one entity's sub immediately", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: "1",
			cancel_immediately: true,
			// @ts-expect-error
			prorate: false,
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});

	it("should advance test clock to end of trial and have correct sub", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 10).getTime(),
			waitForSeconds: 30,
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});

		const customer = await autumn.customers.get(customerId);
		const latestInvoice = customer.invoices[0];

		// Should only have paid for 4 pro and 2 premium...
		const invoiceTotal =
			getBasePrice({ product: pro }) * 4 +
			getBasePrice({ product: premium }) * 2;

		expect(invoiceTotal).to.equal(latestInvoice.total);

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});
});
