import { createStripeCli } from "@/external/stripe/utils.js";
import { CusProductStatus } from "@autumn/shared";
import { expect } from "chai";
import { addHours, addDays } from "date-fns";
import Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "tests/utils/init.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { alexProducts } from "./init.js";
import chalk from "chalk";
import { timeout } from "tests/utils/genUtils.js";

describe(
  chalk.yellowBright(
    "06_switch: Testing upgrades / downgrades from pro <-> premium"
  ),
  () => {
    let customerId = "alex-upgrade-downgrade-customer";
    let testClockId = "";
    let fingerprint = "fp1";

    let stripeCli: Stripe;
    before("initializing customer", async function () {
      stripeCli = createStripeCli({
        org: this.org,
        env: this.env,
      });
      const { testClockId: newTestClockId } = await initCustomerWithTestClock({
        customerId,
        sb: this.sb,
        org: this.org,
        env: this.env,
        fingerprint,
      });
      testClockId = newTestClockId;
    });

    describe("First upgrade from pro to premium (trial to trial)", () => {
      it("should attach pro product", async function () {
        await timeout(10000);
        await AutumnCli.attach({
          customerId,
          productId: alexProducts.pro.id,
        });

        const cusRes = await AutumnCli.getCustomer(customerId);
        compareMainProduct({
          sent: alexProducts.pro,
          cusRes,
          status: CusProductStatus.Trialing,
        });
      });

      it("should upgrade to premium", async function () {
        await AutumnCli.attach({
          customerId,
          productId: alexProducts.premium.id,
        });

        const cusRes = await AutumnCli.getCustomer(customerId);
        compareMainProduct({
          sent: alexProducts.premium,
          cusRes,
          status: CusProductStatus.Trialing,
        });

        // Should have 2 invoices
        expect(cusRes.invoices.length).to.equal(2);
        expect(cusRes.invoices[0].total).to.equal(0);
      });
    });

    describe("Downgrade from premium to pro (trial to paid)", () => {
      it("should attach pro product (downgrade from premium trial)", async function () {
        await AutumnCli.attach({
          customerId,
          productId: alexProducts.pro.id,
        });

        const cusRes = await AutumnCli.getCustomer(customerId);
        compareMainProduct({
          sent: alexProducts.premium,
          cusRes,
          status: CusProductStatus.Trialing,
        });

        let proProduct = cusRes.products.find(
          (p: any) => p.id === alexProducts.pro.id
        );

        expect(proProduct.status).to.equal(CusProductStatus.Scheduled);
        expect(proProduct.starts_at).to.exist;
        expect(proProduct.starts_at).to.be.greaterThan(Date.now());

        await advanceTestClock({
          stripeCli,
          testClockId,
          advanceTo: addHours(new Date(proProduct.starts_at), 10).getTime(),
        });
      });

      it("should have pro product and last invoice for $20", async function () {
        const cusRes = await AutumnCli.getCustomer(customerId);
        compareMainProduct({
          sent: alexProducts.pro,
          cusRes,
          status: CusProductStatus.Active,
        });

        const lastInvoice = cusRes.invoices[0];
        expect(lastInvoice.total).to.equal(20);
      });
    });

    describe("Upgrade from pro to premium (paid to paid)", () => {
      // Now, advance 15 days and upgrade again, and check that the new invoice is for between 25 and 35 (because of the prorated amount)
      it("should advance clock by 15 days and attach premium", async function () {
        await advanceTestClock({
          stripeCli,
          testClockId,
          advanceTo: addDays(new Date(), 7 + 15).getTime(),
        });

        await AutumnCli.attach({
          customerId,
          productId: alexProducts.premium.id,
        });

        await timeout(10000);

        const cusRes = await AutumnCli.getCustomer(customerId);
        compareMainProduct({
          sent: alexProducts.premium,
          cusRes,
        });
      });

      it("should have new invoice for roughly 15 days of premium (due to prorated)", async function () {
        let premiumPrice = alexProducts.premium.prices[0].config.amount;
        let proPrice = alexProducts.pro.prices[0].config.amount;

        let proratedAmount = ((premiumPrice - proPrice) * 15) / 30;
        const cusRes = await AutumnCli.getCustomer(customerId);
        const lastInvoice = cusRes.invoices[0];

        // Expect invoice to be prorated amount +/- 10%
        expect(lastInvoice.product_ids[0]).to.equal(alexProducts.premium.id);
        expect(lastInvoice.total).to.be.greaterThan(proratedAmount * 0.9);
        expect(lastInvoice.total).to.be.lessThan(proratedAmount * 1.1);
      });
    });
  }
);

// Also, downgrade and cancel pro
describe(chalk.yellowBright("06_switch: Testing fingerprint"), () => {
  let customerId = "alex-fingerprint-test";
  let fingerprint = "fp1";

  before("initializing customer", async function () {
    await initCustomer({
      customer_data: {
        id: customerId,
        name: "Alex Fingerprint Test",
        email: "alex-fingerprint-test@test.com",
        fingerprint,
      },
      attachPm: true,
      sb: this.sb,
      org: this.org,
      env: this.env,
    });
  });

  it("should attach pro product and have invoice for $20", async function () {
    await AutumnCli.attach({
      customerId,
      productId: alexProducts.pro.id,
    });

    const cusRes = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: alexProducts.pro,
      cusRes,
      status: CusProductStatus.Active,
    });

    const invoices = cusRes.invoices;
    expect(invoices[0].total).to.equal(20);
  });

  it("should attach premium product and have invoice for $30", async function () {
    await AutumnCli.attach({
      customerId,
      productId: alexProducts.premium.id,
    });

    const cusRes = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: alexProducts.premium,
      cusRes,
      status: CusProductStatus.Active,
    });

    const invoices = cusRes.invoices;
    expect(invoices[0].total).to.equal(30);
  });
});
