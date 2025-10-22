import {
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { defaultApiVersion } from "tests/constants.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

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
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1;
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

	it("should attach premium product to entity 1", async () => {
		await autumn.entities.create(customerId, newEntities);

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

	it("should attach premium product to entity 2", async () => {
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

	it("should attach pro product to entity 1", async () => {
		await autumn.attach({
			customer_id: customerId,
			entity_id: entity1.id,
			product_id: pro.id,
		});

		const entity = await autumn.entities.get(customerId, entity1.id);
		const proProd = entity.products.find((p: any) => p.id === pro.id);
		expect(proProd).to.exist;
		expect(proProd.status).to.equal(CusProductStatus.Scheduled);
	});

	it("should advance test clock and have pro attached to entity 1", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const entity = await autumn.entities.get(customerId, entity1.id);
		const proProd = entity.products.find((p: any) => p.id === pro.id);
		expect(proProd).to.exist;
		expect(proProd.status).to.equal(CusProductStatus.Active);
		expect(entity.products.length).to.equal(2);

		const entity2Res = await autumn.entities.get(customerId, entity2.id);
		const premiumProd = entity2Res.products.find(
			(p: any) => p.id === premium.id,
		);
		expect(premiumProd).to.exist;
		expect(premiumProd.status).to.equal(CusProductStatus.Active);
		expect(entity2Res.products.length).to.equal(2);
	});
});
