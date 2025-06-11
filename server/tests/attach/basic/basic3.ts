import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { assert, expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { timeout } from "tests/utils/genUtils.js";
import {
  constructProduct,
  constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { createProducts } from "tests/utils/productUtils.js";

// const oneTimeQuantity = 2;
// const oneTimePurchaseCount = 2;
// const oneTimeOverrideQuantity = 4;
// const monthlyQuantity = 2;
let oneTimeItem = constructPrepaidItem({
  featureId: features.metered1.id,
  price: 9,
  billingUnits: 250,
  isOneOff: true,
});

let oneTime = constructRawProduct({
  id: "basic3_one_off",
  items: [oneTimeItem],
  isAddOn: true,
});

let monthlyItem = constructPrepaidItem({
  featureId: features.metered1.id,
  price: 9,
  billingUnits: 250,
});

let monthly = constructRawProduct({
  id: "basic3_monthly",
  items: [
    constructPrepaidItem({
      featureId: features.metered1.id,
      price: 9,
      billingUnits: 250,
    }),
  ],
});

// UNCOMMENT FROM HERE
const testCase = "basic3";
describe(`${chalk.yellowBright("basic3: Testing attach one time / monthly add ons")}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt();
  let db, org, env;

  before(async function () {
    await setupBefore(this);
    db = this.db;
    org = this.org;
    env = this.env;

    await initCustomer({
      autumn: this.autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    await createProducts({
      autumn: this.autumnJs,
      db,
      orgId: org.id,
      env,
      products: [oneTime, monthly],
    });
  });

  it("should attach pro", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: products.pro.id,
    });

    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.pro,
      cusRes: res,
    });
  });

  const oneTimeQuantity = 500;
  const oneTimeBillingUnits = oneTimeItem.billing_units;
  const oneTimePurchaseCount = 2;

  it("should attach one time add on twice, force checkout", async function () {
    for (let i = 0; i < 2; i++) {
      const res = await autumn.attach({
        customer_id: customerId,
        product_id: oneTime.id,
        force_checkout: true,
      });

      await completeCheckoutForm(
        res.checkout_url,
        oneTimeQuantity / oneTimeBillingUnits!,
      );
      await timeout(20000);
    }
  });

  it("should have correct product & entitlements", async function () {
    const cusRes = await AutumnCli.getCustomer(customerId);

    const addOnBalance = cusRes.entitlements.find(
      (e: any) =>
        e.feature_id === features.metered1.id &&
        e.interval ==
          products.oneTimeAddOnMetered1.entitlements.metered1.interval,
    );

    const expectedAmt = oneTimeQuantity * oneTimePurchaseCount;

    expect(addOnBalance!.balance).to.equal(
      expectedAmt,
      "add on balance should be correct",
    );
    expect(cusRes.add_ons).to.have.lengthOf(
      1,
      "should only have one add on product after two purchases (since they combine)",
    );
    expect(cusRes.add_ons[0].id).to.equal(
      oneTime.id,
      "add on product should exist",
    );
    expect(cusRes.invoices.length).to.equal(
      1 + oneTimePurchaseCount,
      "invoices should be correct",
    );
  });

  it("should have correct /check result for metered1", async function () {
    const res: any = await AutumnCli.entitled(customerId, features.metered1.id);

    expect(res!.allowed).to.be.true;

    const proMetered1Amt = products.pro.entitlements.metered1.allowance;
    const addOnBalance = res!.balances.find(
      (b: any) => b.feature_id === features.metered1.id,
    );

    expect(res!.allowed).to.be.true;
    expect(addOnBalance!.balance).to.equal(
      proMetered1Amt! + oneTimeQuantity * oneTimePurchaseCount,
    );
  });
});
