import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

// OPERATIONS:
// Premium, Premium
// Pro, Pro
// Premium, Premium

// UNCOMMENT FROM HERE
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

const init = [
	{ entityId: "1", product: premium }, // upgrade to premium
	{ entityId: "2", product: premium }, // upgrade to premium
];

const ops1 = [
	{
		entityId: "1",
		product: pro,
		results: [
			{ product: premium, status: CusProductStatus.Active },
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

// Renew
const ops2 = [
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
];

describe(`${chalk.yellowBright("mergedDowngrade1: Testing merged subs, downgrade 2 pros")}`, () => {
	const customerId = "mergedDowngrade1";
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
			products: [pro, premium],
			prefix: customerId,
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

	for (const op of init) {
		test(`should attach ${op.product.id} to entity ${op.entityId}`, async () => {
			await autumn.attach({
				customer_id: customerId,
				product_id: op.product.id,
				entity_id: op.entityId,
			});
		});
	}

	for (const op of ops1) {
		test(`should downgrade entity ${op.entityId} to pro and have correct sub + schedule`, async () => {
			await autumn.attach({
				customer_id: customerId,
				product_id: pro.id,
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
			});
		});
	}

	for (const op of ops2) {
		test(`should renew entity ${op.entityId} and have correct sub + schedule`, async () => {
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
			});
		});
	}
});
