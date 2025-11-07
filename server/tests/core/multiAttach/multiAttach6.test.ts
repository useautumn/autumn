import {
	type AppEnv,
	CusProductStatus,
	type FullCusProduct,
	LegacyVersion,
	nullish,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { TestFeature } from "tests/setup/v2Features.js";
import {
	expectMultiAttachCorrect,
	expectResultsCorrect,
} from "tests/utils/expectUtils/expectMultiAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const premium = constructProduct({
	id: "premium",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 200 }),
	],
	type: "premium",
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
});

const testCase = "multiAttach6";
describe(`${chalk.yellowBright("multiAttach6: Testing multi attach and get customer")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				config: {
					...org.config,
					entity_product: true,
				},
			},
		});

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

	it("should run multi attach through checkout and have correct sub", async () => {
		const productsList = [
			{
				product_id: pro.id,
				quantity: 4,
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

	it("should transfer to entity 1 and 2", async () => {
		await autumn.entities.create(customerId, entities);

		await autumn.transfer(customerId, {
			to_entity_id: "1",
			product_id: pro.id,
		});

		await autumn.transfer(customerId, {
			to_entity_id: "2",
			product_id: pro.id,
		});

		const results = [
			{
				product_id: pro.id,
				quantity: 4,
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
				product_id: pro.id,
				quantity: 1,
				product: pro,
				entityId: "1",
				status: CusProductStatus.Active,
			},
			{
				product_id: pro.id,
				quantity: 1,
				product: pro,
				entityId: "2",
				status: CusProductStatus.Active,
			},
		];

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

	it("should try to reduce quantity of pro to 0 and have no top level cus product...", async () => {
		await autumn.attach({
			customer_id: customerId,
			products: [
				{
					product_id: pro.id,
					quantity: 2,
				},
			],
		});

		const results = [
			{
				product: pro,
				quantity: 1,
				entityId: "1",
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
				quantity: 2,
				status: CusProductStatus.Active,
			},
		];

		await expectResultsCorrect({
			customerId,
			results,
		});

		const fullCus = await CusService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: customerId,
		});

		const proProduct = fullCus.customer_products.find(
			(p: FullCusProduct) =>
				p.product_id === pro.id && nullish(p.internal_entity_id),
		);
		expect(proProduct).to.be.undefined;
	});

	it("should increase pro product quantity and have correct amount", async () => {
		await autumn.attach({
			customer_id: customerId,
			products: [
				{
					product_id: pro.id,
					quantity: 4,
				},
			],
		});
	});

	after(async () => {
		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				config: {
					...org.config,
					entity_product: false,
				},
			},
		});
		await CacheManager.disconnect();
	});

	return;
});
