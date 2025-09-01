import type { Customer } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { v1ProductToBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import { calculateMetered1Price } from "@/external/stripe/utils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { features, products } from "../../global.js";
import { compareMainProduct } from "../../utils/compare.js";
import { timeout } from "../../utils/genUtils.js";
import { advanceClockForInvoice } from "../../utils/stripeUtils.js";

const testCase = "usage1";

describe(`${chalk.yellowBright("usage1: Testing basic usage product")}`, () => {
	const NUM_EVENTS = 50;
	const customerId = testCase;
	let testClockId: string;
	let _customer: Customer;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		stripeCli = this.stripeCli;

		const { customer: customer_, testClockId: testClockId_ } =
			await initCustomer({
				customerId,
				org: this.org,
				env: this.env,
				db: this.db,
				autumn: this.autumnJs,
				attachPm: "success",
			});

		_customer = customer_;
		testClockId = testClockId_;
	});

	it("should attach usage based product", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.proWithOverage.id,
		});

		const res = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.proWithOverage,
			cusRes: res,
		});
	});

	it("usage1: should send metered1 events", async () => {
		const batchUpdates = [];
		for (let i = 0; i < NUM_EVENTS; i++) {
			batchUpdates.push(
				AutumnCli.sendEvent({
					customerId: customerId,
					eventName: features.metered1.eventName,
				}),
			);
		}

		await Promise.all(batchUpdates);
		await timeout(25000);
	});

	it("should have correct metered1 balance after sending events", async () => {
		const res: any = await AutumnCli.entitled(customerId, features.metered1.id);

		expect(res?.allowed).to.be.true;

		const balance = res?.balances.find(
			(balance: any) => balance.feature_id === features.metered1.id,
		);

		const proOverageAmt =
			products.proWithOverage.entitlements.metered1.allowance;

		expect(res?.allowed, "should be allowed").to.be.true;

		expect(balance?.balance, "should have correct metered1 balance").to.equal(
			proOverageAmt! - NUM_EVENTS,
		);

		expect(balance?.usage_allowed, "should have usage_allowed").to.be.true;
	});

	// Check invoice
	it("should advance stripe test clock and wait for event", async () => {
		await advanceClockForInvoice({
			stripeCli,
			testClockId,
			waitForMeterUpdate: true,
		});
	});

	it("should have correct invoice amount", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);
		const invoices = cusRes?.invoices;

		// calculate price
		const price = calculateMetered1Price({
			product: products.proWithOverage,
			numEvents: NUM_EVENTS,
			metered1Feature: features.metered1,
		});

		expect(invoices.length).to.equal(2);

		const invoice = invoices[0];

		const basePrice = v1ProductToBasePrice({
			prices: products.proWithOverage.prices,
		});

		expect(invoice.total).to.equal(
			price + basePrice,
			"invoice total should be usage price + base price",
		);
	});
});
