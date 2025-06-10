// TESTING UPGRADES

import chalk from "chalk";
import { AppEnv, Organization } from "@autumn/shared";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import {
  attachFailedPaymentMethod,
  attachPmToCus,
} from "@/external/stripe/stripeCusUtils.js";
import { Customer } from "@autumn/shared";
import { compareMainProduct } from "tests/utils/compare.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "upgradeOld4";
describe(`${chalk.yellowBright("upgradeOld4: Testing upgrade from pro -> premium")}`, () => {
  let customer: Customer;
  let customerId = testCase;

  let stripeCli: Stripe;
  let db: DrizzleCli;
  let org: Organization;
  let env: AppEnv;
  let autumn: AutumnInt = new AutumnInt();

  before(async function () {
    await setupBefore(this);

    stripeCli = this.stripeCli;
    db = this.db;
    org = this.org;
    env = this.env;

    let { customer: customer_ } = await initCustomer({
      autumn: this.autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    customer = customer_;
  });

  it("should attach pro (trial)", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: products.pro.id,
    });

    let res = await autumn.customers.get(customerId);
    compareMainProduct({
      sent: products.pro,
      cusRes: res,
    });
  });

  // 1. Try force checkout...
  it("should attach premium and not be able to force checkout", async function () {
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

  it("should attach premium and not be able to upgrade (without payment method)", async function () {
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

  it("should attach premium and have correct product and entitlements", async function () {
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
