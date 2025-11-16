import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	AttachScenario,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

const ops = [
	{
		entityId: "1",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
		skipSubCheck: true,
	},
	{
		entityId: "2",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
];

const cancels = [
	{
		entityId: "1",
		product: premium,
	},
	{
		entityId: "2",
		product: premium,
		shouldBeCanceled: true,
	},
];

const renewals = [
	{
		entityId: "1",
		product: premium,
	},

	{
		entityId: "2",
		product: premium,
	},
];

const testCase = "mergedCancel1";
describe(`${chalk.yellowBright("mergedCancel1: Merged cancel")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [premium],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		testClockId = res.testClockId!;
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

	test("should run operations", async () => {
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
					skipSubCheck: op.skipSubCheck,
					entityId: op.entityId,
				});
			} catch (error) {
				console.log(`Operation failed: ${op.product.id}, index: ${index}`);
				throw error;
			}
		}
	});

	test("should track usage cancel, advance test clock and have correct invoice", async () => {
		for (const cancel of cancels) {
			await autumn.cancel({
				customer_id: customerId,
				product_id: cancel.product.id,
				entity_id: cancel.entityId,
				cancel_immediately: false,
			});

			await expectSubToBeCorrect({
				db,
				customerId,
				org,
				env,
				shouldBeCanceled: cancel.shouldBeCanceled,
			});
		}
	});

	test("should renew both entities", async () => {
		for (const renewal of renewals) {
			const checkout = await autumn.checkout({
				customer_id: customerId,
				product_id: renewal.product.id,
				entity_id: renewal.entityId,
			});

			expect(checkout.product.scenario).toBe(AttachScenario.Renew);
			expect(checkout.total).toBe(0);

			const attach = await autumn.attach({
				customer_id: customerId,
				product_id: renewal.product.id,
				entity_id: renewal.entityId,
			});

			await expectSubToBeCorrect({
				db,
				customerId,
				org,
				env,
			});
		}
	});
});
