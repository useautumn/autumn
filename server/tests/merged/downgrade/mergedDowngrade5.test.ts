import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

// OPERATIONS:
// Premium, Premium
// Free, Free
// Pro, Free

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const free = constructProduct({
	id: "free",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "free",
	isDefault: false,
});

const premium = constructProduct({
	id: "premium",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "premium",
});

const ops = [
	{
		entityId: "1",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
	{
		entityId: "1",
		product: free,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: free, status: CusProductStatus.Scheduled },
		],
	},
	{
		entityId: "2",
		product: free,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: free, status: CusProductStatus.Scheduled },
		],
		shouldBeCanceled: true,
	},
	{
		entityId: "2",
		product: pro,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: pro, status: CusProductStatus.Scheduled },
		],
	},
	// {
	//   entityId: "2",
	//   product: free,
	//   results: [{ product: free, status: CusProductStatus.Active }],
	// },
];

const testCase = "mergedDowngrade5";
describe(`${chalk.yellowBright("mergedDowngrade5: Testing downgrade to free")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

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
			products: [pro, free, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, free, premium],
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

			await attachAndExpectCorrect({
				autumn,
				customerId,
				product: op.product,
				stripeCli,
				db,
				org,
				env,
				entities,
				entityId: op.entityId,
				shouldBeCanceled: op.shouldBeCanceled,
			});

			for (const result of op.results) {
				const entity = await autumn.entities.get(customerId, op.entityId);
				expectProductAttached({
					customer: entity,
					product: result.product,
					status: result.status,
				});
			}
		}
	});
	return;

	// it("should advance test clock and have correct premium downgraded for entity 2", async function () {
	//   await advanceToNextInvoice({
	//     stripeCli,
	//     testClockId,
	//   });

	//   // 1. Check that only
	//   const results = [
	//     {
	//       entityId: "1",
	//       product: premiumAnnual,
	//       status: CusProductStatus.Active,
	//     },
	//     { entityId: "2", product: premium, status: CusProductStatus.Active },
	//   ];

	//   for (const result of results) {
	//     const entity = await autumn.entities.get(customerId, result.entityId);
	//     expectProductAttached({
	//       customer: entity,
	//       product: result.product,
	//       status: result.status,
	//     });

	//     const products = entity.products.filter(
	//       (p: any) => p.group == result.product.group
	//     );
	//     expect(products.length).to.equal(1);
	//   }
	// });
});
