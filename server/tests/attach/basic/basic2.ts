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

const oneTimeQuantity = 2;
const oneTimePurchaseCount = 2;
const oneTimeOverrideQuantity = 4;
const monthlyQuantity = 2;

// UNCOMMENT FROM HERE
const testCase = "basic2";
describe(`${chalk.yellowBright("basic2: Testing attach pro")}`, () => {
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
      fingerprint: "test",
    });
  });

  it("should attach pro through checkout", async function () {
    const { checkout_url } = await autumn.attach({
      customer_id: customerId,
      product_id: products.pro.id,
    });

    await completeCheckoutForm(checkout_url);
    await timeout(10000);
  });

  it("should have correct product & entitlements", async function () {
    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.pro,
      cusRes: res,
    });
    expect(res.invoices.length).to.be.greaterThan(0);
  });

  // return;

  it("should have correct result when calling /check", async function () {
    const proEntitlements = products.pro.entitlements;

    for (const entitlement of Object.values(proEntitlements)) {
      const allowance = entitlement.allowance;

      const res: any = await AutumnCli.entitled(
        customerId,
        entitlement.feature_id!,
      );

      const entBalance = res!.balances.find(
        (b: any) => b.feature_id === entitlement.feature_id,
      );

      try {
        expect(res!.allowed).to.be.true;
        expect(entBalance).to.exist;
        if (entitlement.allowance) {
          expect(entBalance!.balance).to.equal(allowance);
        }
        // console.log(`   - ${entitlement.feature_id} -- Passed`);
      } catch (error) {
        console.group();
        console.group();
        console.log("Looking for: ", entitlement);
        console.log("Received: ", res);
        console.groupEnd();
        console.groupEnd();
        throw error;
      }
    }
  });

  return;

  const oneTimeBillingUnits =
    products.oneTimeAddOnMetered1.prices[0].config.billing_units;
  const monthlyBillingUnits =
    products.monthlyAddOnMetered1.prices[0].config.billing_units;

  describe("One time add on (force checkout)", () => {
    // PURCHASE ONE TIME ADD ON

    it("POST /attach -- attaching one time add on (force checkout) [no quantity passed in]", async function () {
      try {
        for (let i = 0; i < oneTimePurchaseCount; i++) {
          const res = await AutumnCli.attach({
            customerId: customerId,
            productId: products.oneTimeAddOnMetered1.id,
            forceCheckout: true,
          });

          await completeCheckoutForm(res.checkout_url, oneTimeOverrideQuantity);
          await timeout(10000); // for webhook to be processed
          console.log(`   ${chalk.greenBright("Attached one time add on")}`);
        }
      } catch (error) {
        console.group();
        console.group();
        console.log("Failed to attach one time add on");
        console.log("Error data:", error);
        console.groupEnd();
        console.groupEnd();
        process.exit(1);
      }
    });

    // TODO: Attach one time add on again (with quantity?)

    it("GET /customers/:id -- checking product & entitlements (one time add on)", async function () {
      const cusRes = await AutumnCli.getCustomer(customerId);

      // 1. Metered1 balance should be pro + one time add on

      // Fetch balance
      const addOnBalance = cusRes.entitlements.find(
        (e: any) =>
          e.feature_id === features.metered1.id &&
          e.interval ==
            products.oneTimeAddOnMetered1.entitlements.metered1.interval,
      );

      const expectedAmt =
        (oneTimeOverrideQuantity || oneTimeQuantity) *
        oneTimeBillingUnits *
        oneTimePurchaseCount;

      try {
        assert.equal(addOnBalance!.balance, expectedAmt);
        assert.equal(cusRes.add_ons.length, 1);
        assert.equal(cusRes.add_ons[0].id, products.oneTimeAddOnMetered1.id);
        assert.equal(cusRes.invoices.length, 1 + oneTimePurchaseCount);
      } catch (error) {
        console.group();
        console.group();
        console.log("GET customer, balances failed");
        console.log(
          "Add on entitlement:",
          products.oneTimeAddOnMetered1.entitlements.metered1,
        );
        console.log("Customer entitlements:", cusRes.entitlements);

        console.groupEnd();
        console.groupEnd();
        throw error;
      }
    });

    it("GET /entitled -- checking entitled for metered1", async function () {
      const res: any = await AutumnCli.entitled(
        customerId,
        features.metered1.id,
      );

      expect(res!.allowed).to.be.true;

      // pro metered1
      const proMetered1Amt = products.pro.entitlements.metered1.allowance;

      const addOnBalance = res!.balances.find(
        (b: any) => b.feature_id === features.metered1.id,
      );

      expect(res!.allowed).to.be.true;
      expect(addOnBalance!.balance).to.equal(
        proMetered1Amt! +
          (oneTimeOverrideQuantity || oneTimeQuantity) *
            oneTimeBillingUnits *
            oneTimePurchaseCount,
      );
    });
  });

  // PURCHASE MONTHLY ADD ON
  describe("Monthly add on", () => {
    it("POST /attach -- attaching monthly add on", async function () {
      await AutumnCli.attach({
        customerId: customerId,
        productId: products.monthlyAddOnMetered1.id,
        forceCheckout: false,
        options: [
          {
            feature_id: features.metered1.id,
            quantity: monthlyQuantity * monthlyBillingUnits,
          },
        ],
      });
      await timeout(10000);

      console.log(`   ${chalk.greenBright("Attached monthly top up")}`);
    });

    it("GET /customers/:id -- checking product & entitlements (monthly add on)", async function () {
      const cusRes = await AutumnCli.getCustomer(customerId);

      // 1. Metered1 balance should be pro + one time add on
      const proMetered1 = products.pro.entitlements.metered1.allowance;

      // Fetch balance
      const monthlyMetered1Balance = cusRes.entitlements.find(
        (e: any) =>
          e.feature_id === features.metered1.id &&
          e.interval ==
            products.monthlyAddOnMetered1.entitlements.metered1.interval,
      );

      try {
        assert.equal(
          monthlyMetered1Balance!.balance,
          proMetered1! + monthlyQuantity * monthlyBillingUnits,
        );

        assert.equal(cusRes.add_ons.length, 2);
        const monthlyAddOnId = cusRes.add_ons.find(
          (a: any) => a.id === products.monthlyAddOnMetered1.id,
        );

        assert.exists(monthlyAddOnId);
        expect(cusRes.invoices.length).to.equal(2 + oneTimePurchaseCount);
      } catch (error) {
        console.group();
        console.group();
        console.log("GET customer, balances failed");
        console.log(
          "Add on entitlement:",
          products.monthlyAddOnMetered1.entitlements.metered1,
        );
        console.log("Customer entitlements:", cusRes.entitlements);

        console.groupEnd();
        console.groupEnd();
        throw error;
      }
    });

    it("GET /entitled -- checking entitlements (monthly add on)", async function () {
      const res: any = await AutumnCli.entitled(
        customerId,
        features.metered1.id,
      );

      const metered1Balance = res!.balances.find(
        (b: any) => b.feature_id === features.metered1.id,
      );

      const proMetered1Amt = products.pro.entitlements.metered1.allowance;
      const monthlyAddOnMetered1Amt = monthlyQuantity * monthlyBillingUnits;

      const oneTimeAddOnMetered1Amt =
        (oneTimeOverrideQuantity || oneTimeQuantity) *
        oneTimeBillingUnits *
        oneTimePurchaseCount;

      try {
        expect(metered1Balance!.balance).to.equal(
          proMetered1Amt! + monthlyAddOnMetered1Amt + oneTimeAddOnMetered1Amt,
        );
      } catch (error) {
        console.group();
        console.group();
        console.log("GET entitled, balances failed");

        console.log("/entitled response:", res);
        console.log("Pro metered1 amt:", proMetered1Amt);
        console.log("Monthly add on metered1 amt:", monthlyAddOnMetered1Amt);
        console.log("One time add on metered1 amt:", oneTimeAddOnMetered1Amt);

        console.groupEnd();
        console.groupEnd();
        throw error;
      }
    });
  });
});
