import { beforeAll, describe, expect, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

export const premium = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "premium",
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

const ops = [
	{
		product: pro,
		entityId: "1",
	},
	{
		product: pro,
		entityId: "2",
	},
];

const testCase = "separate1";
describe(`${chalk.yellowBright(`${testCase}: Testing separate subscriptions because of invoice checkout`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });
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

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			withTestClock: true,
		});

		db = ctx.db;
		org = ctx.org;
		env = ctx.env;

		await autumn.entities.create(customerId, entities);
	});

	const subIds: string[] = [];
	test("should attach pro  product", async () => {
		for (const op of ops) {
			const res = await autumn.attach({
				customer_id: customerId,
				product_id: op.product.id,
				invoice: true,
				entity_id: op.entityId,
			});

			await completeInvoiceCheckout({
				url: res.checkout_url,
			});
		}

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db,
			orgId: org.id,
			env,
		});
		const cusProducts = fullCus.customer_products;
		const entity1Prod = cusProducts.find((cp) => cp.entity_id === "1");
		const entity2Prod = cusProducts.find((cp) => cp.entity_id === "2");

		const entity1SubId = entity1Prod?.subscription_ids?.[0];
		const entity2SubId = entity2Prod?.subscription_ids?.[0];

		expect(entity1SubId).not.toBe(entity2SubId);

		subIds.push(entity1SubId!);
		subIds.push(entity2SubId!);

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			subId: entity1SubId,
		});
	});

	test("should upgrade both entities to premium", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: "1",
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: "2",
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			subId: subIds[0],
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			subId: subIds[1],
		});
	});
});
