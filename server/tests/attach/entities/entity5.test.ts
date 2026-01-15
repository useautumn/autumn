import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { defaultApiVersion } from "@tests/constants.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import {
	expectProductAttached,
	expectScheduledApiSub,
} from "../../utils/expectUtils/expectProductAttached";

const testCase = "aentity5";

export const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 1500,
		}),
	],
	type: "pro",
});
export const premium = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 1500,
		}),
	],
	type: "premium",
});

describe(`${chalk.yellowBright(`attach/${testCase}: Testing downgrade entity product`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
	let testClockId: string;

	beforeAll(async () => {
		const result = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = result.testClockId!;

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
		});
	});

	const newEntities = [
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

	const entity1 = newEntities[0];
	const entity2 = newEntities[1];

	test("should attach premium product to entity 1", async () => {
		await autumn.entities.create(customerId, newEntities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			entityId: entity1.id,
			numSubs: 1,
		});
	});

	test("should attach premium product to entity 2", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			entityId: entity2.id,
			numSubs: 2,
		});
	});

	test("should attach pro product to entity 1", async () => {
		await autumn.attach({
			customer_id: customerId,
			entity_id: entity1.id,
			product_id: pro.id,
		});

		const entity = await autumn.entities.get(customerId, entity1.id);

		expectProductAttached({
			customer: entity,
			product: pro,
			status: CusProductStatus.Scheduled,
		});

		await expectScheduledApiSub({
			customerId,
			entityId: entity1.id,
			productId: pro.id,
		});
		// const entity = await autumn.entities.get(customerId, entity1.id);
		// const proProd = entity.products.find((p: any) => p.id === pro.id);
		// expect(proProd).toBeDefined();
		// expect(proProd.status).toBe(CusProductStatus.Scheduled);
	});

	test("should advance test clock and have pro attached to entity 1", async () => {
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const entity = await autumn.entities.get(customerId, entity1.id);
		const proProd = entity.products?.find((p: any) => p.id === pro.id);
		expect(proProd).toBeDefined();
		expect(proProd?.status).toBe(CusProductStatus.Active);
		expect(entity.products?.length).toBe(1);

		const entity2Res = await autumn.entities.get(customerId, entity2.id);
		const premiumProd = entity2Res.products?.find(
			(p: any) => p.id === premium.id,
		);
		expect(premiumProd).toBeDefined();
		expect(premiumProd?.status).toBe(CusProductStatus.Active);
		expect(entity2Res.products?.length).toBe(1);
	});
});
