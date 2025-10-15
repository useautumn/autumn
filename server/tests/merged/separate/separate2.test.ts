import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
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

const addOnBillingUnits = 100;
export const addOn = constructRawProduct({
	id: "creditsAddOn",
	isAddOn: true,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Credits,
			billingUnits: addOnBillingUnits,
			includedUsage: 0,
			price: 10,
		}),
	],
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

const testCase = "separate2";
describe(`${chalk.yellowBright(`${testCase}: Testing separate subscriptions because of force checkout`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });
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

		addPrefixToProducts({
			products: [pro, premium, addOn],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium, addOn],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			// attachPm: "success",
		});

		testClockId = testClockId1!;
	});

	const subIds: string[] = [];
	it("should attach pro  product", async () => {
		await autumn.entities.create(customerId, entities);
		for (const op of ops) {
			const res = await autumn.attach({
				customer_id: customerId,
				product_id: op.product.id,
				force_checkout: true,
				entity_id: op.entityId,
			});

			expect(res.checkout_url).to.exist;

			await completeCheckoutForm(res.checkout_url);
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

		expect(entity1SubId).to.not.equal(entity2SubId);

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

	it("should upgrade both entities to premium", async () => {
		for (const id of ["1", "2"]) {
			await autumn.attach({
				customer_id: customerId,
				product_id: premium.id,
				entity_id: id,
			});
			await expectSubToBeCorrect({
				db,
				customerId,
				org,
				env,
				subId: subIds[0]!,
			});

			await expectSubToBeCorrect({
				db,
				customerId,
				org,
				env,
				subId: subIds[1],
			});
		}
	});

	it("should attach add on to entity 2 and correct sub", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
			entity_id: "2",
			options: [
				{
					feature_id: TestFeature.Credits,
					quantity: addOnBillingUnits * 2,
				},
			],
		});

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db,
			orgId: org.id,
			env,
		});
		const cusProducts = fullCus.customer_products;
		const addOnProd = cusProducts.find((cp) => cp.product.id === addOn.id);

		expect(addOnProd).to.exist;
		const addOnSubId = addOnProd?.subscription_ids?.[0];
		expect(addOnSubId).to.equal(subIds[1]);

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			subId: subIds[1],
		});
	});
});
