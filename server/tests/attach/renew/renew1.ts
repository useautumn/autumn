import {
	type AppEnv,
	AttachBranch,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
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
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "renew1";

export const free = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	isDefault: false,
	type: "free",
});

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 1000,
		}),
	],

	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing renew pro, force checkout`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
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

	it("should attach free, then pro with force checkout and renew", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		// 1. Get attach preview
		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(attachPreview.branch).to.equal(AttachBranch.Renew);

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			force_checkout: true,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});
	});
});
