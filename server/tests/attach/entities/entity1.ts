import { APIVersion, type AppEnv, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "aentity1";

export const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 1500,
		}),
	],
	type: "pro",
});

describe(`${chalk.yellowBright(`attach/${testCase}: Testing attach to entity via checkout`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let _testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const _curUnix = Date.now();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			// attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			db,
			orgId: org.id,
			env,
		});

		// testClockId = testClockId1!;
	});

	const newEntities = [
		{
			id: "1",
			name: "Entity 1",
			feature_id: TestFeature.Users,
		},
	];

	it("should attach pro product to entity 1", async () => {
		await autumn.entities.create(customerId, newEntities);
		const entityId = newEntities[0].id;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			entityId,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
			entityId,
		});
	});
});
