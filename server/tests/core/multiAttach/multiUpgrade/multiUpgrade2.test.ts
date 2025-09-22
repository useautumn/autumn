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
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import {
	expectMultiAttachCorrect,
	expectResultsCorrect,
} from "tests/utils/expectUtils/expectMultiAttach.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";

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

const testCase = "multiUpgrade2";
describe(`${chalk.yellowBright("multiUpgrade2: Testing multi attach and update quantities downward")}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({
		version: APIVersion.v1_4,
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
		];

		await expectMultiAttachCorrect({
			autumn,
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
	];

	const results = [
		{
			product: pro,
			quantity: 5,
			status: CusProductStatus.Active,
		},
		{
			product: premium,
			quantity: 3,
			status: CusProductStatus.Active,
		},
		{
			product: pro,
			quantity: 1,
			entityId: "1",
			status: CusProductStatus.Active,
		},
	];

	it("should transfer to entity and have correct sub", async function () {
		await autumn.entities.create(customerId, entities);

		await autumn.transfer(customerId, {
			to_entity_id: "1",
			product_id: pro.id,
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

	it("should update premium and pro quantities downward", async function () {
		const productsList = [
			{
				product_id: pro.id,
				quantity: 6,
			},
			{
				product_id: premium.id,
				quantity: 1,
			},
		];

		const results = [
			{
				product: pro,
				quantity: 6,
				status: CusProductStatus.Active,
			},
			{
				product: premium,
				quantity: 1,
				status: CusProductStatus.Active,
			},
			{
				product: pro,
				quantity: 1,
				entityId: "1",
				status: CusProductStatus.Active,
			},
		];

		await expectMultiAttachCorrect({
			autumn,
			customerId,
			products: productsList,
			results,
			db,
			org,
			env,
		});
	});
});
