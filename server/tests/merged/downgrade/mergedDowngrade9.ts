import {
	APIVersion,
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceToNextInvoice } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

// UNCOMMENT FROM HERE
const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

const premiumAnnual = constructProduct({
	id: "premiumAnnual",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
	isAnnual: true,
});

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

// const init = [
//   { entityId: "1", product: premiumAnnual }, // upgrade to premium
//   { entityId: "2", product: premium }, // upgrade to premium
// ];

const ops = [
	{
		entityId: "1",
		product: premiumAnnual,
		results: [{ product: premiumAnnual, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
	{
		entityId: "1",
		product: pro,
		results: [
			{ product: premiumAnnual, status: CusProductStatus.Active },
			{ product: pro, status: CusProductStatus.Scheduled },
		],
	},
	{
		entityId: "2",
		product: pro,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: pro, status: CusProductStatus.Scheduled },
		],
	},
];

const testCase = "mergedDowngrade9";
describe(`${chalk.yellowBright("mergedDowngrade9: Testing merged subs, downgrade 2 monthly + annual & advance test clock")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let _curUnix: number;
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
			products: [pro, premium, premiumAnnual],
			prefix: customerId,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, premium, premiumAnnual],
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

	it("should run operations", async () => {
		await autumn.entities.create(customerId, entities);

		for (let index = 0; index < ops.length; index++) {
			const op = ops[index];
			try {
				await attachAndExpectCorrect({
					autumn,
					customerId,
					product: op.product,
					stripeCli,
					db,
					org,
					env,
					entityId: op.entityId,
				});
				// await autumn.attach({
				//   customer_id: customerId,
				//   product_id: op.product.id,
				//   entity_id: op.entityId,
				// });
				// const entity = await autumn.entities.get(customerId, op.entityId);
				// for (const result of op.results) {
				//   expectProductAttached({
				//     customer: entity,
				//     product: result.product,
				//     entityId: op.entityId,
				//   });
				// }
				// expect(
				//   entity.products.filter((p: any) => p.group == premium.group).length
				// ).to.equal(op.results.length);
				// await expectSubToBeCorrect({
				//   db,
				//   customerId,
				//   org,
				//   env,
				// });
			} catch (error) {
				console.log(
					`Operation failed: ${op.entityId} ${op.product.id}, index: ${index}`,
				);
				throw error;
			}
		}
	});

	it("should advance test clock and have correct products for entity 1 & 2", async () => {
		const results = [
			{
				entityId: "1",
				products: [
					{ product: premiumAnnual, status: CusProductStatus.Active },
					{ product: pro, status: CusProductStatus.Scheduled },
				],
			},
			{
				entityId: "2",
				products: [{ product: pro, status: CusProductStatus.Active }],
			},
		];

		await advanceToNextInvoice({
			stripeCli,
			testClockId,
		});

		for (const result of results) {
			const entity = await autumn.entities.get(customerId, result.entityId);
			for (const product of result.products) {
				expectProductAttached({
					customer: entity,
					product: product.product,
					status: product.status,
				});
			}
			const products = entity.products.filter(
				(p: any) => p.group === premium.group,
			);
			expect(products.length).to.equal(result.products.length);
		}
	});

	it("should attach premium to entity 2 and have correct products", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			entityId: "2",
		});
	});
});
