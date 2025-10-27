// TESTING UPGRADES

import chalk from "chalk";
import { beforeAll, describe, expect, test } from "bun:test";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import {
	attachFailedPaymentMethod,
	attachPmToCus,
} from "@/external/stripe/stripeCusUtils.js";
import { Customer } from "@autumn/shared";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	sharedProProduct,
	sharedPremiumProduct,
} from "./sharedProducts.js";

const testCase = "upgradeOld4";
describe(`${chalk.yellowBright("upgradeOld4: Testing upgrade from pro -> premium")}`, () => {
	let customer: Customer;
	const customerId = testCase;

	let stripeCli: Stripe;
	const autumn: AutumnInt = new AutumnInt();

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		const { customer: customer_ } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		customer = customer_;
	});

	test("should attach pro (trial)", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: sharedProProduct.id,
		});

		const res = await autumn.customers.get(customerId);
		expectCustomerV0Correct({
			sent: sharedProProduct,
			cusRes: res,
			ctx,
		});
	});

	// 1. Try force checkout...
	test("should attach premium and not be able to force checkout", async () => {
		expectAutumnError({
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: sharedPremiumProduct.id,
					force_checkout: true,
				});
			},
		});
	});

	test("should attach premium and not be able to upgrade (without payment method)", async () => {
		await attachFailedPaymentMethod({
			stripeCli: stripeCli,
			customer: customer,
		});

		await expectAutumnError({
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: sharedPremiumProduct.id,
					force_checkout: true,
				});
			},
		});
	});

	// Attach payment method
	test("should attach successful payment method", async () => {
		await attachPmToCus({
			db: ctx.db,
			customer: customer,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should attach premium and have correct product and entitlements", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedPremiumProduct.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({
			sent: sharedPremiumProduct,
			cusRes: res,
			ctx,
		});
	});
});
