import { compareMainProduct } from "../utils/compare.js";
import { initCustomer } from "../utils/init.js";
import { features, products } from "../global.js";
import { AutumnCli } from "../cli/AutumnCli.js";
import { assert, expect } from "chai";
import { timeout } from "../utils/genUtils.js";
import { completeCheckoutForm } from "../utils/stripeUtils.js";
import { getAxiosInstance } from "../utils/setup.js";
import chalk from "chalk";
import { AppEnv, CusProductStatus, Organization } from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";

const cancelProduct = async ({
  org,
  env,
  customerId,
  productId,
}: {
  org: Organization;
  env: AppEnv;
  customerId: string;
  productId: string;
}) => {
  const stripeCli = createStripeCli({ org, env });
  const cusRes: any = await AutumnCli.getCustomer(customerId);
  const proProduct = cusRes.products.find((p: any) => p.id === productId);

  // await stripeCli.subscriptions.cancel(proProduct.processor.subscription_id!);
  for (const subId of proProduct.subscription_ids) {
    await stripeCli.subscriptions.cancel(subId);
  }

  await timeout(3000);
};

describe(`${chalk.yellowBright("05_trial: Testing free trials")}`, () => {
  const customerId = "customerWithTrial";
  let customerId2 = "customerWithTrialSameFingerprint";

  describe("First customer, attach pro with trial", () => {
    before(async function () {
      await initCustomer({
        customer_data: {
          id: customerId,
          name: customerId,
          email: "test@test.com",
          fingerprint: "fp1",
        },
        db: this.db,
        org: this.org,
        env: this.env,
      });
    });

    it("should attach pro with trial", async function () {
      const res = await AutumnCli.attach({
        customerId: customerId,
        productId: products.proWithTrial.id,
      });

      await completeCheckoutForm(res.checkout_url);
      await timeout(10000); // for webhook to be processed
    });

    // 1. Check if product is attached
    it("should have correct product & invoice (pro with trial)", async function () {
      const customer = await AutumnCli.getCustomer(customerId);

      compareMainProduct({
        sent: products.proWithTrial,
        cusRes: customer,
        status: CusProductStatus.Trialing,
      });

      // Check invoice is 0
      try {
        const invoices = customer.invoices;
        assert.equal(invoices.length, 1);
        assert.equal(invoices[0].total, 0);
      } catch (error) {
        console.group();
        console.group();
        console.log("GET customer, balances failed");
        console.log("Expected invoice amount 0");
        console.log("Customer invoices received:", customer.invoices);
        console.groupEnd();
        console.groupEnd();
        throw error;
      }
    });

    // 2. Cancel product and attach again
    it("should cancel pro with trial", async function () {
      await cancelProduct({
        org: this.org,
        env: this.env,
        customerId: customerId,
        productId: products.proWithTrial.id,
      });
    });
    it("should attach pro with trial again", async function () {
      await AutumnCli.attach({
        customerId: customerId,
        productId: products.proWithTrial.id,
      });

      await timeout(5000); // for webhook to be processed
    });
  });

  describe("Second customer (same fingerprint), attach pro with trial", () => {
    // 3. Check if product is attached
    it("should have correct product & invoice (pro with trial, full price)", async function () {
      const customer = await AutumnCli.getCustomer(customerId);
      compareMainProduct({
        sent: products.proWithTrial,
        cusRes: customer,
        status: CusProductStatus.Active,
      });

      // Check invoice is equal monthly price
      const invoices = customer.invoices;
      try {
        assert.equal(
          invoices[0].amount,
          products.proWithTrial.prices[0].amount,
        );
      } catch (error) {
        console.group();
        console.group();
        console.log("GET customer, balances failed");
        console.log(
          "Expected invoice amount:",
          products.proWithTrial.prices[0].amount,
        );
        console.log("Customer invoices received:", invoices);
        console.groupEnd();
        console.groupEnd();
      }
    });

    it("should create new customer and attach pro with trial (same fingerprint)", async function () {
      await initCustomer({
        customer_data: {
          id: customerId2,
          name: customerId2,
          email: "test2@test.com",
          fingerprint: "fp1",
        },
        db: this.db,
        org: this.org,
        env: this.env,
        attachPm: true,
      });

      await AutumnCli.attach({
        customerId: customerId2,
        productId: products.proWithTrial.id,
      });

      await timeout(8000); // for webhook to be processed
    });

    it("should have correct product & invoice (pro with trial, full price)", async function () {
      const customer = await AutumnCli.getCustomer(customerId2);
      compareMainProduct({
        sent: products.proWithTrial,
        cusRes: customer,
        status: CusProductStatus.Active,
      });

      // Check invoice is equal monthly price
      const invoices = customer.invoices;
      try {
        assert.equal(
          invoices[0].amount,
          products.proWithTrial.prices[0].amount,
        );
      } catch (error) {
        console.group();
        console.group();
        console.log("GET customer, balances failed");
        console.log(
          "Expected invoice amount:",
          products.proWithTrial.prices[0].amount,
        );
        console.log("Customer invoices received:", invoices);
        console.groupEnd();
        console.groupEnd();
      }
    });
  });
});
