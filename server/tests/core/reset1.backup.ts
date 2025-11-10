import {
	type AppEnv,
	type Customer,
	LegacyVersion,
	type LimitedItem,
	type Organization,
	ProductItemInterval,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";
import type Stripe from "stripe";
import { resetAndGetCusEnt } from "tests/advanced/rollovers/rolloverTestUtils.js";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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

export const free = constructProduct({
	items: [messagesItem, wordsItem],
	type: "free",
	isDefault: false,
});

const testCase = "reset1";

describe(`${chalk.yellowBright(`${testCase}: Testing custom reset intervals`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let customer: Customer;
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

	it("should attach free product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	const messageUsage = 250;
	const curBalance = messagesItem.included_usage;

	it("should reset messages feature and have correct next reset at", async () => {
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

	it("should reset words feature and have correct next reset at", async () => {
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
