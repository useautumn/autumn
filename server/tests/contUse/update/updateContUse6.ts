import {
	type AppEnv,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { addPrefixToProducts, replaceItems } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearProratedItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { timeout } from "../../utils/genUtils.js";

const freeItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 3,
});

const paidUserItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 10,
	config: {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.ProrateImmediately,
	},
});

const pro = constructProduct({
	items: [freeItem],
	type: "pro",
});

const testCase = "updateContUse6";

describe(`${chalk.yellowBright(`contUse/${testCase}: free product, continuous use, then upgrade to pro which has MORE included usage`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	const curUnix = Date.now();

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

	const usage = 3;
	it("should attach free and track usage", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usage,
		});
		await timeout(2000);
	});

	const customItems = replaceItems({
		items: pro.items,
		featureId: TestFeature.Users,
		newItem: paidUserItem,
	});

	it("should replace user item with paid and increased allowance", async () => {
		const customProduct = {
			...pro,
			items: customItems,
		};

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			is_custom: true,
			items: customItems,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.invoices?.[0].total).to.equal(0);
	});

	// const extraUsage = 2;
	// const newItem = constructArrearProratedItem({
	// 	featureId: TestFeature.Users,
	// 	pricePerUnit: 50,
	// 	includedUsage: (userItem.included_usage as number) + extraUsage,
	// 	config: {
	// 		on_increase: OnIncrease.ProrateImmediately,
	// 		on_decrease: OnDecrease.ProrateImmediately,
	// 	},
	// });
});
