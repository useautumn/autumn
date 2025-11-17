import { beforeAll, describe, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

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
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

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

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, free, premium],
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

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;

		await autumn.entities.create(customerId, entities);
	});

	for (const op of ops) {
		test(`should attach ${op.product.id} to entity ${op.entityId}`, async () => {
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
		});
	}

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
