import chalk from "chalk";
import Stripe from "stripe";
import { expect } from "chai";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectAttachCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";

export let pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const testCase = "others7";

describe(`${chalk.yellowBright(`${testCase}: Testing attach with free_trial=False`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		await initCustomer({
			db,
			org,
			env,
			autumn: this.autumnJs,
			customerId,
			fingerprint: "test",
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			db,
			orgId: org.id,
			env,
			autumn,
			products: [pro],
		});
	});

	it("should attach pro product with free_trial=False", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			free_trial: false,
		});

		const customer = await autumn.customers.get(customerId);

		expectAttachCorrect({
			customer,
			product: pro,
		});

		expect(customer.invoices.length).to.equal(1);
		expect(customer.invoices[0].total).to.equal(getBasePrice({ product: pro }));
	});
});
