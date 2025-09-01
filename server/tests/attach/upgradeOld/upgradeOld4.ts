// TESTING UPGRADES

import type { AppEnv, Customer, Organization } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	attachFailedPaymentMethod,
	attachPmToCus,
} from "@/external/stripe/stripeCusUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "upgradeOld4";
describe(`${chalk.yellowBright("upgradeOld4: Testing upgrade from pro -> premium")}`, () => {
	let customer: Customer;
	const customerId = testCase;

	let stripeCli: Stripe;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;
	const autumn: AutumnInt = new AutumnInt();

	before(async function () {
		await setupBefore(this);

		stripeCli = this.stripeCli;
		db = this.db;
		org = this.org;
		env = this.env;

		const { customer: customer_ } = await initCustomer({
			autumn: this.autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		customer = customer_;
	});

	it("should attach pro (trial)", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: products.pro.id,
		});

		const res = await autumn.customers.get(customerId);
		compareMainProduct({
			sent: products.pro,
			cusRes: res,
		});
	});

	// 1. Try force checkout...
	it("should attach premium and not be able to force checkout", async () => {
		expectAutumnError({
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: products.premium.id,
					force_checkout: true,
				});
			},
		});
	});

	it("should attach premium and not be able to upgrade (without payment method)", async () => {
		await attachFailedPaymentMethod({
			stripeCli: stripeCli,
			customer: customer,
		});

		await expectAutumnError({
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: products.premium.id,
					force_checkout: true,
				});
			},
		});
	});

	// Attach payment method
	it("should attach successful payment method", async function () {
		await attachPmToCus({
			db: this.db,
			customer: customer,
			org: this.org,
			env: this.env,
		});
	});

	it("should attach premium and have correct product and entitlements", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.premium.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.premium,
			cusRes: res,
		});
	});
});
