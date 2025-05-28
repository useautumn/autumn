// TESTING UPGRADES

import chalk from "chalk";
import { initCustomer } from "../utils/init.js";
import { CusProductStatus } from "@autumn/shared";
import { AutumnCli } from "../cli/AutumnCli.js";
import { products } from "../global.js";
import { assert } from "chai";
import {
  attachFailedPaymentMethod,
  attachPmToCus,
} from "@/external/stripe/stripeCusUtils.js";
import { Customer } from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import { compareMainProduct } from "../utils/compare.js";
import { addDays } from "date-fns";
import { timeout } from "../utils/genUtils.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";

describe(`${chalk.yellowBright("06_upgrade: Testing upgrades")}`, () => {
  let customer: Customer;
  let customerId = "upgrade";

  before(async function () {
    this.timeout(30000);
    customer = await initCustomer({
      customer_data: {
        id: customerId,
        name: "Test Customer",
        email: "test@test.com",
      },
      db: this.db,
      org: this.org,
      env: this.env,
      attachPm: true,
    });
  });

  it("should attach pro (first time, trial)", async function () {
    this.timeout(30000);
    const res = await AutumnCli.attach({
      customerId: customerId,
      productId: products.pro.id,
    });

    console.log(`   ${chalk.greenBright("Attached pro")}`);
  });

  it("should have correct product and entitlements", async function () {
    this.timeout(30000);
    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.pro,
      cusRes: res,
    });
  });

  // 1. Try force checkout...
  it("should attach premium and not be able to force checkout", async function () {
    this.timeout(30000);
    try {
      const res = await AutumnCli.attach({
        customerId: customerId,
        productId: products.premium.id,
        forceCheckout: true,
      });

      throw new Error("Should not reach here");
    } catch (error: any) {
      assert.equal(
        error.message,
        "Either payment method not found, or force_checkout is true: unable to perform upgrade / downgrade",
      );
      assert.equal(error.code, "invalid_request");
    }
  });

  it("should attach premium and not be able to upgrade (without payment method)", async function () {
    this.timeout(30000);
    try {
      const stripeCli = createStripeCli({
        org: this.org,
        env: this.env,
      });
      await attachFailedPaymentMethod({
        stripeCli: stripeCli,
        customer: customer,
      });

      const res = await AutumnCli.attach({
        customerId: customerId,
        productId: products.premium.id,
        forceCheckout: true,
      });

      throw new Error("Should not reach here");
    } catch (error: any) {
      try {
        assert.equal(
          error.message,
          "Either payment method not found, or force_checkout is true: unable to perform upgrade / downgrade",
        );
        assert.equal(error.code, "invalid_request");
      } catch (error) {
        console.group();
        console.log(
          "Expected recase error for force checkout / no payment method",
        );
        console.log("Got:", error);
        console.groupEnd();
        throw error;
      }
    }
  });

  // Attach payment method
  it("should attach successful payment method", async function () {
    this.timeout(30000);
    await attachPmToCus({
      db: this.db,
      customer: customer,
      org: this.org,
      env: this.env,
    });
  });

  it("should attach premium", async function () {
    this.timeout(30000);
    const res = await AutumnCli.attach({
      customerId: customerId,
      productId: products.premium.id,
    });

    console.log(`   ${chalk.greenBright("Attached premium")}`);
  });

  it("GET /customers/:customer_id -- checking product and ents", async function () {
    this.timeout(30000);
    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.premium,
      cusRes: res,
    });
  });
});

describe(`${chalk.yellowBright(
  "06_upgrade: Testing upgrade (paid to trial)",
)}`, () => {
  const customerId = "paid_to_trial";
  let testClockId: string;
  let customer: any;

  before(async function () {
    this.timeout(30000);
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });
    const testClock = await stripeCli.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });
    testClockId = testClock.id;
    customer = await initCustomer({
      customer_data: {
        id: customerId,
        name: "Paid to trial customer",
        email: "paid@trial.com",
      },
      db: this.db,
      org: this.org,
      env: this.env,
      attachPm: true,
      testClockId,
    });
  });

  it("POST /attach -- attaching pro", async function () {
    this.timeout(30000);
    await AutumnCli.attach({
      customerId: customerId,
      productId: products.pro.id,
    });

    console.log(`   ${chalk.greenBright("Attached pro")}`);
  });

  it("POST /attach -- attaching premium with trial", async function () {
    this.timeout(30000);

    await AutumnCli.attach({
      customerId: customerId,
      productId: products.premiumWithTrial.id,
    });

    console.log(`   ${chalk.greenBright("Attached premium")}`);
  });
});

describe(`${chalk.yellowBright(
  "06_upgrade: Testing upgrade (trial to paid)",
)}`, () => {
  const customerId = "trial_to_paid";
  let testClockId: string;
  let customer: any;

  before(async function () {
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });
    const testClock = await stripeCli.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });
    testClockId = testClock.id;
    customer = await initCustomer({
      customer_data: {
        id: customerId,
        name: "Trial to paid customer",
        email: "trial@paid.com",
      },
      db: this.db,
      org: this.org,
      env: this.env,
      attachPm: true,
      testClockId,
    });
  });

  it("POST /attach -- attaching pro with trial", async function () {
    await AutumnCli.attach({
      customerId: customerId,
      productId: products.proWithTrial.id,
    });

    console.log(`   ${chalk.greenBright("Attached pro with trial")}`);
  });

  it("POST /attach -- attaching premium", async function () {
    const advanceTo = addDays(new Date(), 3).getTime() / 1000;
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });
    await stripeCli.testHelpers.testClocks.advance(testClockId, {
      frozen_time: Math.floor(advanceTo),
    });

    await timeout(10000);

    await AutumnCli.attach({
      customerId: customerId,
      productId: products.premium.id,
    });

    await timeout(10000);

    console.log(
      `   ${chalk.greenBright("Advanced 3 days and attached premium")}`,
    );
  });

  it("GET /customers/:customer_id -- checking product and ents", async function () {
    this.timeout(30000);
    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.premium,
      cusRes: res,
    });

    const invoices = await res.invoices;

    try {
      assert.equal(invoices[0].total, products.premium.prices[0].config.amount);
    } catch (error) {
      console.group();
      console.log("Expected invoice to be for 50.00");
      console.log("Got:", res.invoices);
      console.groupEnd();
      throw error;
    }
  });
});

describe(`${chalk.yellowBright("Testing upgrade (trial to trial)")}`, () => {
  const customerId = "trialToTrial";
  let testClockId: string;
  let customer: any;

  before(async function () {
    console.log("   - Running initCustomer");
    this.timeout(30000);
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });
    const testClock = await stripeCli.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });
    testClockId = testClock.id;
    customer = await initCustomer({
      customer_data: {
        id: customerId,
        name: "Trial to trial customer",
        email: "trial@trial.com",
      },
      db: this.db,
      org: this.org,
      env: this.env,
      attachPm: true,
      testClockId,
    });
  });

  it("POST /attach -- attaching pro with trial", async function () {
    this.timeout(30000);
    await AutumnCli.attach({
      customerId: customerId,
      productId: products.proWithTrial.id,
    });

    console.log(`   ${chalk.greenBright("Attached pro with trial")}`);
  });

  it("POST /attach -- attaching premium with trial", async function () {
    this.timeout(30000);

    const advanceTo = addDays(new Date(), 3).getTime() / 1000;
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });
    await stripeCli.testHelpers.testClocks.advance(testClockId, {
      frozen_time: Math.floor(advanceTo),
    });

    await timeout(10000);

    await AutumnCli.attach({
      customerId: customerId,
      productId: products.premiumWithTrial.id,
    });

    console.log(
      `   ${chalk.greenBright("Advanced 3 days and attached premium")}`,
    );
  });

  it("GET /customers/:customer_id -- checking product and ents", async function () {
    this.timeout(30000);
    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.premiumWithTrial,
      cusRes: res,
      status: CusProductStatus.Trialing,
    });

    const invoices = await res.invoices;

    try {
      assert.equal(invoices[0].total, 0);
    } catch (error) {
      console.group();
      console.log("Expected invoice to be 0");
      console.log("Got:", res.invoices);
      console.groupEnd();
      throw error;
    }
  });
});
