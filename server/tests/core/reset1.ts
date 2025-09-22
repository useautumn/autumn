import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

import {
	APIVersion,
	AppEnv,
	Customer,
	LimitedItem,
	Organization,
	ProductItemInterval,
	RolloverDuration,
} from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";

import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { resetAndGetCusEnt } from "tests/advanced/rollovers/rolloverTestUtils.js";
import { UTCDate } from "@date-fns/utc";
import { addDays, addMonths } from "date-fns";

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	interval: ProductItemInterval.Day,
	intervalCount: 3,
}) as LimitedItem;

const wordsItem = constructFeatureItem({
	featureId: TestFeature.Words,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
	intervalCount: 4,
}) as LimitedItem;

export let free = constructProduct({
	items: [messagesItem, wordsItem],
	type: "free",
	isDefault: false,
});

const testCase = "reset1";

describe(`${chalk.yellowBright(`${testCase}: Testing custom reset intervals`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let customer: Customer;
	let stripeCli: Stripe;
	let curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [free],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const res = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockId = res.testClockId!;
		customer = res.customer;
	});

	it("should attach free product", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	let messageUsage = 250;
	let curBalance = messagesItem.included_usage;

	it("should reset messages feature and have correct next reset at", async function () {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messageUsage,
		});

		await timeout(3000);

		await resetAndGetCusEnt({
			db,
			customer,
			productGroup: free.group,
			featureId: TestFeature.Messages,
		});

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];
		expect(msgesFeature.next_reset_at).to.exist;
		expect(msgesFeature.next_reset_at).to.approximately(
			addDays(new Date(), 3).getTime(),
			1000 * 30,
		);
	});

	it("should reset words feature and have correct next reset at", async function () {
		await resetAndGetCusEnt({
			db,
			customer,
			productGroup: free.group,
			featureId: TestFeature.Words,
		});

		const cus = await autumn.customers.get(customerId);
		const wordsFeature = cus.features[TestFeature.Words];
		expect(wordsFeature.next_reset_at).to.exist;
		expect(wordsFeature.next_reset_at).to.approximately(
			addMonths(new Date(), 4).getTime(),
			1000 * 30 * 60, // account for timezone differences
		);
	});
});
