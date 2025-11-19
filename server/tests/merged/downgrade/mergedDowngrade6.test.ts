import { beforeAll, describe, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// OPERATIONS:
// Growth, Growth
// Free
// Pro
// Premium
// Free

const pro = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
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
const growth = constructProduct({
	id: "growth",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "growth",
});

const ops = [
	{
		entityId: "1",
		product: growth,
		results: [{ product: growth, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: growth,
		results: [{ product: growth, status: CusProductStatus.Active }],
	},
	{
		entityId: "1",
		product: free,
		results: [
			{ product: growth, status: CusProductStatus.Active },
			{ product: free, status: CusProductStatus.Scheduled },
		],
	},
	{
		entityId: "1",
		product: pro,
		results: [
			{ product: growth, status: CusProductStatus.Active },
			{ product: pro, status: CusProductStatus.Scheduled },
		],
	},
	{
		entityId: "1",
		product: premium,
		results: [
			{ product: growth, status: CusProductStatus.Active },
			{ product: premium, status: CusProductStatus.Scheduled },
		],
	},
	{
		entityId: "1",
		product: free,
		results: [
			{ product: growth, status: CusProductStatus.Active },
			{ product: free, status: CusProductStatus.Scheduled },
		],
	},
];

const testCase = "mergedDowngrade6";
describe(`${chalk.yellowBright("mergedDowngrade6: Testing downgrade changes")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
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
			products: [pro, free, premium, growth],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
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
		testClockId = res.testClockId!;

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
});
