import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import { addPrefixToProducts } from "@tests/attach/utils.js";
import { setupBefore } from "@tests/before.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import {
	expectDowngradeCorrect,
	expectNextCycleCorrect,
} from "@tests/utils/expectUtils/expectScheduleUtils.js";
import { createProducts } from "@tests/utils/productUtils.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "customInterval4";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 500,
		}),
	],
	intervalCount: 2,
	type: "pro",
});

export const premium = constructProduct({
	id: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 500,
		}),
	],
	intervalCount: 2,
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing downgrades for custom intervals`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	it("should attach premium product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
		});
	});

	it("should have correct next cycle at on checkout", async () => {
		const checkout = await autumn.checkout({
			customer_id: customerId,
			product_id: pro.id,
		});

		const expectedNextCycle = addMonths(new Date(), 2);
		expect(checkout.next_cycle?.starts_at).to.be.approximately(
			expectedNextCycle.getTime(),
			1000 * 60 * 60 * 24,
		);

		expect(checkout.total).to.equal(0);
	});

	let preview: any;
	it("should downgrade to pro", async () => {
		const { preview: preview_ } = await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: premium,
			newProduct: pro,
			stripeCli,
			db,
			org,
			env,
		});

		preview = preview_;
	});

	it("should have pro attached on next cycle", async () => {
		await expectNextCycleCorrect({
			preview: preview!,
			autumn,
			stripeCli,
			customerId,
			testClockId,
			product: pro,
			db,
			org,
			env,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).to.equal(2);
		expect(invoices[0].total).to.equal(getBasePrice({ product: pro }));
	});
});
