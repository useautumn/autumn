import { beforeAll, describe, it } from "bun:test";
import { CusProductStatus, LegacyVersion } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Premium, Premium
// Cancel Immediately, Cancel Immediately
// Results: No sub

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
		cancelImmediately: true,
	},
	{
		entityId: "2",
		product: premium,
		cancelImmediately: true,
		shouldBeCanceled: true,
		skipSubCheck: true,
	},
];

const testCase = "mergedCancel3";
describe(`${chalk.yellowBright("mergedCancel3: Testing cancel immediately")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [premium],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: false,
		});

		stripeCli = ctx.stripeCli;
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
					db: ctx.db,
					org: ctx.org,
					env: ctx.env,
					entityId: op.entityId,
				});
			} catch (error) {
				console.log(`Operation failed: ${op.product.id}, index: ${index}`);
				throw error;
			}
		}
	});

	it("should track usage cancel, advance test clock and have correct invoice", async () => {
		for (const cancel of cancels) {
			await autumn.cancel({
				customer_id: customerId,
				product_id: cancel.product.id,
				entity_id: cancel.entityId,
				cancel_immediately: cancel.cancelImmediately ?? false,
			});

			if (cancel.skipSubCheck) continue;

			await expectSubToBeCorrect({
				db: ctx.db,
				customerId,
				org: ctx.org,
				env: ctx.env,
				shouldBeCanceled: cancel.shouldBeCanceled,
			});
		}
	});
});
