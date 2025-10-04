import {
	type AppEnv,
	AttachScenario,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [premium],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [premium],
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
					skipSubCheck: op.skipSubCheck,
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

	it("should renew both entities", async () => {
		for (const renewal of renewals) {
			const checkout = await autumn.checkout({
				customer_id: customerId,
				product_id: renewal.product.id,
				entity_id: renewal.entityId,
			});

			expect(checkout.product.scenario).to.equal(AttachScenario.Renew);
			expect(checkout.total).to.equal(0);

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
