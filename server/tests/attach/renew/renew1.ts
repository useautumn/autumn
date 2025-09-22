import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, AttachBranch, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { expect } from "chai";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";

const testCase = "renew1";

export let free = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	isDefault: false,
	type: "free",
});

export let pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 1000,
		}),
	],

	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing renew pro, force checkout`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [free, pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free, pro],
			db,
			orgId: org.id,
			env,
		});
	});

	it("should attach pro product", async function () {
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

	it("should attach free, then pro with force checkout and renew", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		// 1. Get attach preview
		let attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(attachPreview.branch).to.equal(AttachBranch.Renew);

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			force_checkout: true,
		});

		let customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});
	});
});
