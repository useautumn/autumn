import { APIVersion, type AppEnv, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts, replaceItems } from "../utils.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

export const addOn = constructRawProduct({
	id: "add_on_1",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 200,
		}),
	],
	isAddOn: true,
});

const testCase = "addOn1";

describe(`${chalk.yellowBright(`${testCase}: Testing free add on, and updating free add on`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_2 });
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

		addPrefixToProducts({
			products: [pro, addOn],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, addOn],
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

		_testClockId = testClockId1!;
	});

	it("should should attach pro product, then add on product", async () => {
		await attachAndExpectCorrect({
			autumn,
			db,
			org,
			env,
			stripeCli,
			customerId,
			product: pro,
		});
	});

	it("should should attach add on product", async () => {
		const _preview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: addOn.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
		});

		const customer = await autumn.customers.get(customerId);

		expect(customer.products.length).to.equal(3);
		expectProductAttached({
			customer,
			product: addOn,
		});
		expectProductAttached({
			customer,
			product: pro,
		});
	});

	const customItems = replaceItems({
		items: addOn.items,
		featureId: TestFeature.Messages,
		newItem: constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 400,
		}),
	});

	it("should update add on product", async () => {
		const _preview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: addOn.id,
			is_custom: true,
			items: customItems,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
			is_custom: true,
			items: customItems,
		});

		const customer = await autumn.customers.get(customerId);

		expect(customer.products.length).to.equal(3);
		expectProductAttached({
			customer,
			product: addOn,
		});
	});
});
