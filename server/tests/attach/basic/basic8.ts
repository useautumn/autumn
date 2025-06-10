import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { CusProductStatus } from "@autumn/shared";
import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";

const testCase = "basic8";

describe(`${chalk.yellowBright("basic8: Testing trial duplicates (same fingerprint)")}`, () => {
  const customerId = testCase;
  let customerId2 = testCase + "2";
  const autumn = new AutumnInt();

  before(async function () {
    const randFingerprint = Math.random().toString(36).substring(2, 15);
    await setupBefore(this);
    await initCustomer({
      customerId,
      db: this.db,
      org: this.org,
      env: this.env,
      autumn: this.autumnJs,
      fingerprint: randFingerprint,
      attachPm: "success",
    });

    await initCustomer({
      customerId: customerId2,
      db: this.db,
      org: this.org,
      env: this.env,
      autumn: this.autumnJs,
      fingerprint: randFingerprint,
      attachPm: "success",
    });
  });

  it("should attach pro with trial and have correct product & invoice", async function () {
    await AutumnCli.attach({
      customerId: customerId,
      productId: products.proWithTrial.id,
    });

    const customer = await AutumnCli.getCustomer(customerId);

    compareMainProduct({
      sent: products.proWithTrial,
      cusRes: customer,
      status: CusProductStatus.Trialing,
    });

    const invoices = customer.invoices;
    expect(invoices.length).to.equal(1, "Invoice length should be 1");
    expect(invoices[0].total).to.equal(0, "Invoice total should be 0");
  });

  it("should attach pro with trial to second customer and have correct product & invoice (pro with trial, full price)", async function () {
    await autumn.attach({
      customer_id: customerId2,
      product_id: products.proWithTrial.id,
    });

    // await timeout(5000); // for webhook to be processed
    const customer = await AutumnCli.getCustomer(customerId2);

    compareMainProduct({
      sent: products.proWithTrial,
      cusRes: customer,
      status: CusProductStatus.Active,
    });

    // Check invoice is equal monthly price
    const invoices = customer.invoices;
    expect(invoices.length).to.equal(1, "Invoice length should be 1");
    expect(invoices[0].total).to.equal(
      10,
      "Invoice total should be full price",
    );
  });
});
