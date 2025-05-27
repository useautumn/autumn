import { expect } from "chai";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { features, products } from "../../global.js";
import { compareMainProduct } from "../../utils/compare.js";
import { initCustomer } from "../../utils/init.js";
import {
  advanceClockForInvoice,
  completeCheckoutForm,
} from "../../utils/stripeUtils.js";
import { timeout } from "../../utils/genUtils.js";
import {
  calculateMetered1Price,
  createStripeCli,
} from "@/external/stripe/utils.js";
import chalk from "chalk";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { Customer } from "@autumn/shared";
describe(`${chalk.yellowBright("usage1: Pro with overage")}`, () => {
  const NUM_EVENTS = 50;
  const customerId = "usage1";
  let testClockId: string;
  let customer: Customer;
  before(async function () {
    const { customer: customer_, testClockId: testClockId_ } =
      await initCustomerWithTestClock({
        customerId,
        org: this.org,
        env: this.env,
        db: this.db,
      });

    customer = customer_;
    testClockId = testClockId_;
  });

  it("usage1: should create a usage based entitlement", async function () {
    const res = await AutumnCli.attach({
      customerId: customerId,
      productId: products.proWithOverage.id,
      forceCheckout: true,
    });

    await completeCheckoutForm(res.checkout_url);
    await timeout(10000);
  });

  it("usage1: should have correct product", async function () {
    const res = await AutumnCli.getCustomer(customerId);

    compareMainProduct({
      sent: products.proWithOverage,
      cusRes: res,
    });
  });

  it("usage1: should send metered1 events", async function () {
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
    await timeout(10000);
  });

  it("usage1: should have correct metered1 balance after sending events", async function () {
    const res: any = await AutumnCli.entitled(customerId, features.metered1.id);

    expect(res!.allowed).to.be.true;

    const balance = res!.balances.find(
      (balance: any) => balance.feature_id === features.metered1.id,
    );

    const proOverageAmt =
      products.proWithOverage.entitlements.metered1.allowance;

    try {
      expect(res!.allowed).to.be.true;
      expect(balance?.balance).to.equal(proOverageAmt! - NUM_EVENTS);
      expect(balance?.usage_allowed).to.be.true;
    } catch (error) {
      console.group();
      console.log("Entitled res", res);
      console.group();
      throw error;
    }
  });

  // Check invoice
  it("usage1: advance stripe test clock and wait for event", async function () {
    // this.timeout(1000 * 60 * 10);

    const stripeCli = createStripeCli({ org: this.org, env: this.env });
    await advanceClockForInvoice({
      stripeCli,
      testClockId,
      waitForMeterUpdate: true,
    });
  });

  it("usage1: should have correct invoice amount", async function () {
    const cusRes = await AutumnCli.getCustomer(customerId);
    const invoices = cusRes!.invoices;

    // calculate price
    const price = calculateMetered1Price({
      product: products.proWithOverage,
      numEvents: NUM_EVENTS,
      metered1Feature: features.metered1,
    });

    try {
      expect(invoices.length).to.equal(2);

      const invoice2 = invoices[0];
      expect(invoice2.total).to.equal(
        price + products.proWithOverage.prices[0].config.amount,
      );
    } catch (error) {
      console.group();
      console.log(
        "Expected invoices[0] to have total of: ",
        price + products.proWithOverage.prices[0].config.amount,
      );
      console.log("Invoices", invoices);
      console.group();
      throw error;
    }
  });
});
