import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	BillingInterval,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import { defaultApiVersion } from "@tests/constants.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../../merged/mergeUtils/expectSubCorrect.js";
import { expectProductAttached } from "../../utils/expectUtils/expectProductAttached.js";

const testCase = "migrations8";

const premiumWordsItem = constructArrearItem({
	featureId: TestFeature.Words,
	includedUsage: 5000,
});

const premium = constructProduct({
	id: "premium",
	items: [premiumWordsItem],
	type: "premium",
	isDefault: false,
});

const updatedPremiumWordsItem = constructArrearItem({
	featureId: TestFeature.Words,
	includedUsage: 10000,
});

const updatedPremiumPriceItem = constructPriceItem({
	price: 80,
	interval: BillingInterval.Month,
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

describe(`${chalk.yellowBright(`${testCase}: Testing migration with entities - one cancelled, one active`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const entity1 = entities[0];
	const entity2 = entities[1];

	beforeAll(async () => {
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [premium],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should create entities", async () => {
		await autumn.entities.create(customerId, entities);
	});

	test("should attach premium product to entity 1", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			entityId: entity1.id,
			numSubs: 1,
		});
	});

	test("should attach premium product to entity 2", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			entityId: entity2.id,
			numSubs: 2,
		});
	});

	test("should cancel premium on entity 1", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entity1.id,
			cancel_immediately: false,
		});

		await timeout(3000);

		const entity = await autumn.entities.get(customerId, entity1.id);
		expectProductAttached({
			customer: entity,
			product: premium,
			status: CusProductStatus.Active,
			isCanceled: true,
		});

		// Entity 2 should still be active and not cancelled
		const entity2Res = await autumn.entities.get(customerId, entity2.id);

		expectProductAttached({
			customer: entity2Res,
			product: premium,
			status: CusProductStatus.Active,
		});
		expect(entity2Res.products?.[0].canceled_at).toBeFalsy();
	});

	test("should update premium product to new version", async () => {
		await autumn.products.update(premium.id, {
			items: [updatedPremiumWordsItem, updatedPremiumPriceItem],
		});
	});

	test("should migrate premium v1 to premium v2", async () => {
		const premiumV2 = { ...premium, version: 2 };
		premiumV2.items = [updatedPremiumWordsItem];

		await autumn.migrate({
			from_product_id: premium.id,
			to_product_id: premiumV2.id,
			from_version: premium.version,
			to_version: premiumV2.version,
		});

		await timeout(10000);

		// Entity 1 should have premium v2, still cancelling
		const entity1Res = await autumn.entities.get(customerId, entity1.id);
		expectProductAttached({
			customer: entity1Res,
			product: premiumV2,
			status: CusProductStatus.Active,
			isCanceled: true,
		});

		// Entity 1 should have updated included usage
		const entity1Words = entity1Res.features![TestFeature.Words].balance;
		expect(entity1Words).toBe(10000);

		// Entity 2 should have premium v2, active and NOT cancelled
		const entity2Res = await autumn.entities.get(customerId, entity2.id);
		expectProductAttached({
			customer: entity2Res,
			product: premiumV2,
			status: CusProductStatus.Active,
		});
		expect(entity2Res.products![0].canceled_at).toBeFalsy();

		// Entity 2 should have updated included usage
		const entity2Words = entity2Res.features![TestFeature.Words].balance;
		expect(entity2Words).toBe(10000);

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});
});
