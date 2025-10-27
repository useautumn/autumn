import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { products } from "tests/global.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { timeout } from "@/utils/genUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "cancel1";
describe(`${chalk.yellowBright("cancel1: Testing cancel for trial products")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async function () {
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

		testClockId = testClockId1!;
	});

	it("should attach pro", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: products.pro.id,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			productId: products.pro.id,
		});
	});

	let sub: Stripe.Subscription | undefined;

	it("should cancel pro product through stripe CLI", async () => {
		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
		});

		sub = await cusProductToSub({
			cusProduct: fullCus.customer_products?.[0],
			stripeCli,
		});

		await stripeCli.subscriptions.update(sub!.id, {
			cancel_at_period_end: true,
		});

		await timeout(4000);

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			productId: products.pro.id,
			isCanceled: true,
		});

		expectProductAttached({
			customer,
			productId: products.free.id,
			status: CusProductStatus.Scheduled,
		});
	});
	return;

	it("should renew pro produce through stripe CLI and have it update correctly", async () => {
		await stripeCli.subscriptions.update(sub!.id, {
			cancel_at_period_end: false,
		});

		await timeout(4000);

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			productId: products.pro.id,
			status: CusProductStatus.Active,
		});

		expect(customer.products.length).to.equal(1);
	});
});
