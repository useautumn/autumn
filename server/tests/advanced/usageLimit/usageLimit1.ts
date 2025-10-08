import {
	type AppEnv,
	ErrCode,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 0,
	usageLimit: 2,
});

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "usageLimit1";

describe(`${chalk.yellowBright(`${testCase}: Testing usage limits for entities`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			customerId,
			db,
			orgId: org.id,
			env,
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
		{
			id: "4",
			name: "Entity 4",
			feature_id: TestFeature.Users,
		},
	];

	it("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});
	it("should create more entities than the limit and hit error", async () => {
		await expectAutumnError({
			errCode: ErrCode.FeatureLimitReached,
			func: async () => {
				await autumn.entities.create(customerId, entities);
			},
		});
	});

	it("should create entities one by one, then hit usage limit", async () => {
		await autumn.entities.create(customerId, entities[0]);
		await autumn.entities.create(customerId, entities[1]);

		await expectAutumnError({
			errCode: ErrCode.FeatureLimitReached,
			func: async () => {
				await autumn.entities.create(customerId, entities[2]);
			},
		});
	});

	it("should have correct check and get customer value", async () => {
		const check = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Users,
		});
		const customer = await autumn.customers.get(customerId);

		expect(check.balance).to.equal(-2);
		// @ts-expect-error
		expect(check.usage_limit).to.equal(userItem.usage_limit);

		// @ts-expect-error
		expect(customer.features[TestFeature.Users].usage_limit).to.equal(
			userItem.usage_limit,
		);
	});
});
