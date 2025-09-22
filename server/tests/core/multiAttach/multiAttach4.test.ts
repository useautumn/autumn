import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	APIVersion,
	AppEnv,
	CusProductStatus,
	Organization,
} from "@autumn/shared";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import {
	addPrefixToProducts,
	getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import {
	expectMultiAttachCorrect,
	expectResultsCorrect,
} from "tests/utils/expectUtils/expectMultiAttach.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays } from "date-fns";
import { expect } from "chai";

let premium = constructProduct({
	id: "premium",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 200 }),
	],
	type: "premium",
});

let pro = constructProduct({
	id: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 300,
		}),
	],
	type: "pro",
});
let proAnnual = constructProduct({
	id: "proAnnual",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 5000,
		}),
	],
	type: "pro",
	isAnnual: true,
});

const testCase = "multiAttach4";
describe(`${chalk.yellowBright("multiAttach4: Testing multi attach for annual products...")}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

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
			products: [pro, premium, proAnnual],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, premium, proAnnual],
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

	it("should run multi attach through checkout and have correct sub", async function () {
		const productsList = [
			{
				product_id: pro.id,
				quantity: 5,
				product: pro,
				status: CusProductStatus.Active,
			},
			{
				product_id: premium.id,
				quantity: 3,
				product: premium,
				status: CusProductStatus.Active,
			},
			{
				product_id: proAnnual.id,
				quantity: 4,
				product: proAnnual,
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
		});
	});

	return;

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
			quantity: 4,
			status: CusProductStatus.Active,
		},
		{
			product: premium,
			quantity: 2,
			status: CusProductStatus.Active,
		},
		{
			product: pro,
			quantity: 1,
			entityId: "2",
			status: CusProductStatus.Active,
		},
		{
			product: pro,
			quantity: 1,
			entityId: "2",
			status: CusProductStatus.Active,
		},
	];

	it("should transfer to entity and have correct sub", async function () {
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

	it("should cancel one entity's sub at end of cycle and have correct schedule...", async function () {
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

	it("should cancel one entity's sub immediately", async function () {
		await autumn.cancel({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: "1",
			cancel_immediately: true,
			// @ts-ignore
			prorate: false,
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});

	it("should advance test clock to end of trial and have correct sub", async function () {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 8).getTime(),
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
