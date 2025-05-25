import { compareMainProduct } from "tests/utils/compare.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { initCustomer } from "tests/utils/init.js";
import { alexFeatures, alexProducts } from "./init.js";
import {
  AllowanceType,
  CusProductStatus,
  EntInterval,
  Entitlement,
} from "@autumn/shared";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { timeout } from "tests/utils/genUtils.js";
import { expect } from "chai";
import {
  checkFeatureHasCorrectBalance,
  runEventsAndCheckBalances,
} from "./utils.js";
import chalk from "chalk";

describe(chalk.yellowBright("Top ups"), () => {
  let customerId = "alex-top-up-customer";
  before("initializing customer", async function () {
    await initCustomer({
      customer_data: {
        id: customerId,
        name: "Alex Top Up Customer",
        email: "alex-top-up-customer@test.com",
      },
      sb: this.sb,
      org: this.org,
      env: this.env,
      attachPm: true,
    });
  });

  it("should attach pro product", async function () {
    await timeout(5000);
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

  let overrideQuantity = 5;
  let billingUnits = alexProducts.topUpMessages.prices[0].config.billing_units;
  let prodEnt = alexProducts.topUpMessages.entitlements.topUpMessage;
  let leftoverBalance = 0;
  it("should attach top up messages through force checkout", async function () {
    const res = await AutumnCli.attach({
      customerId,
      productId: alexProducts.topUpMessages.id,
      forceCheckout: true,
    });

    await completeCheckoutForm(res.checkout_url, overrideQuantity);
    await timeout(10000);

    const cusRes = await AutumnCli.getCustomer(customerId);
    // Get product
    const product = cusRes.add_ons.find(
      (p: any) => p.id === alexProducts.topUpMessages.id,
    );
    expect(product).to.exist;
    expect(product.status).to.equal(CusProductStatus.Active);

    // Check quantity is correct
    let cusEnt = cusRes.entitlements.find(
      (e: any) => e.feature_id === alexFeatures.topUpMessage.id,
    );

    expect(cusEnt).to.exist;
    expect(cusEnt.balance).to.equal(overrideQuantity * billingUnits);
    expect(cusEnt.interval).to.equal(prodEnt.interval);
  });

  // Try buy again
  it("should buy top ups again and have correct balance", async function () {
    // 1. Update leftover balance
    const { allowed, balanceObj }: any = await AutumnCli.entitled(
      customerId,
      alexFeatures.topUpMessage.id,
      true,
    );
    leftoverBalance = balanceObj.balance;

    const res = await AutumnCli.attach({
      customerId,
      productId: alexProducts.topUpMessages.id,
      forceCheckout: true,
    });

    await completeCheckoutForm(res.checkout_url, overrideQuantity);
    await timeout(10000);

    const cusRes = await AutumnCli.getCustomer(customerId);
    // Get product
    const product = cusRes.add_ons.find(
      (p: any) => p.id === alexProducts.topUpMessages.id,
    );
    expect(product).to.exist;
    expect(product.status).to.equal(CusProductStatus.Active);

    // Check quantity is correct
    let cusEnt = cusRes.entitlements.find(
      (e: any) => e.feature_id === alexFeatures.topUpMessage.id,
    );
    expect(cusEnt).to.exist;
    expect(cusEnt.balance).to.equal(
      leftoverBalance + overrideQuantity * billingUnits,
    );
    expect(cusEnt.interval).to.equal(prodEnt.interval);
  });
});

describe(chalk.yellowBright("Testing o1 message top up"), () => {
  let customerId = "alex-o1-top-up-customer";
  let o1TopUpQuantity = Math.floor(Math.random() * 15);
  let billingUnits = alexProducts.o1TopUps.prices[0].config.billing_units;
  let proAllowance = alexProducts.pro.entitlements.o1Message.allowance!;

  before("initializing customer", async function () {
    await initCustomer({
      customer_data: {
        id: customerId,
        name: "Alex O1 Top Up Customer",
        email: "alex-o1-top-up-customer@test.com",
      },
      sb: this.sb,
      org: this.org,
      env: this.env,
      attachPm: true,
    });
  });

  it("should attach pro product", async function () {
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

  it("should buy o1 messages and have correct balance", async function () {
    const res = await AutumnCli.attach({
      customerId,
      productId: alexProducts.o1TopUps.id,
      forceCheckout: true,
    });

    await completeCheckoutForm(res.checkout_url, o1TopUpQuantity);
    await timeout(14000);

    const cusRes = await AutumnCli.getCustomer(customerId);
    // Get product
    const product = cusRes.add_ons.find(
      (p: any) => p.id === alexProducts.o1TopUps.id,
    );

    expect(product).to.exist;
    expect(product.status).to.equal(CusProductStatus.Active);

    // Check quantity is correct
    await checkFeatureHasCorrectBalance({
      customerId,
      feature: alexFeatures.o1Message,
      entitlement: alexProducts.o1TopUps.entitlements.o1Message,
      expectedBalance: o1TopUpQuantity * billingUnits + proAllowance,
    });
  });

  it("should send events and check balances", async function () {
    let allowance = o1TopUpQuantity * billingUnits + proAllowance;

    await runEventsAndCheckBalances({
      customerId,
      entitlements: [
        {
          interval: EntInterval.Lifetime,
          feature_id: alexFeatures.o1Message.id,
          allowance,
          allowance_type: AllowanceType.Fixed,
        } as Entitlement, // manual entitlement because in advance pricing
      ],
    });
  });
});
