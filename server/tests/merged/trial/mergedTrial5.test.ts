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
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
	trial: true,
});

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const ops = [
	{
		entityId: "1",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
	{
		entityId: "3",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
];

const testCase = "mergedTrial5";
describe(`${chalk.yellowBright("mergedTrial5: Testing cancel at end of cycle and cancel immediately on merged sub trial")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, premium],
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
		{
			id: "3",
			name: "Entity 3",
			feature_id: TestFeature.Users,
		},
	];

	it("should attach pro trial for entity 1 and entity 2", async () => {
		await autumn.entities.create(customerId, entities);

		for (const op of ops) {
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
		}
	});

	it("should cancel one sub end of cycle", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: "2",
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			shouldBeTrialing: true,
		});
	});

	it("should cancel one sub immediately", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: "3",
			cancel_immediately: true,
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			shouldBeTrialing: true,
		});
	});

	it("should cancel last sub at end of cycle", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: "1",
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			shouldBeTrialing: true,
			shouldBeCanceled: true,
		});
	});
});
