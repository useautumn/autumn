import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
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
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

// OPERATIONS:
// Premium
// Free
// Free, Premium
// Free, Pro

const free = constructProduct({
	id: "free",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "free",
	isDefault: false,
});

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const ops = [
	{
		entityId: "1",
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
		shouldBeCanceled: true,
	},
	{
		entityId: "2",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
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

const testCase = "mergedDowngrade2";
describe(`${chalk.yellowBright("mergedDowngrade2: Testing merged subs, downgrade free 1, add premium 2")}`, () => {
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
			products: [pro, premium, free],
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

	for (let index = 0; index < ops.length; index++) {
		const op = ops[index];
		test(`should attach ${op.product.id} to entity ${op.entityId}`, async () => {
			try {
				await autumn.attach({
					customer_id: customerId,
					product_id: op.product.id,
					entity_id: op.entityId,
				});

				const entity = await autumn.entities.get(customerId, op.entityId);
				for (const result of op.results) {
					expectProductAttached({
						customer: entity,
						product: result.product,
						entityId: op.entityId,
					});
				}
				expect(
					entity.products.filter((p: any) => p.group === premium.group).length,
				).toBe(op.results.length);

				await expectSubToBeCorrect({
					db,
					customerId,
					org,
					env,
					shouldBeCanceled: op.shouldBeCanceled,
				});
			} catch (error) {
				console.log(
					`Operation failed: ${op.entityId} ${op.product.id}, index: ${index}`,
				);
				throw error;
			}
		});
	}
	// return;

	test("should advance test clock and have correct products for entity 1 & 2", async () => {
		await advanceToNextInvoice({
			stripeCli,
			testClockId,
		});

		const results = [
			{ entityId: "1", product: free, status: CusProductStatus.Active },
			{ entityId: "2", product: pro, status: CusProductStatus.Active },
		];

		for (const result of results) {
			const entity = await autumn.entities.get(customerId, result.entityId);
			expectProductAttached({
				customer: entity,
				product: result.product,
				status: result.status,
			});

			const products = entity.products.filter(
				(p: any) => p.group === result.product.group,
			);
			expect(products.length).toBe(1);
		}

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});

	test("should attach premium to entity 1 (which is free) and have correct products", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			entityId: "1",
		});
	});
});
