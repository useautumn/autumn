import { compareMainProduct } from "../utils/compare.js";
import { initCustomer } from "../utils/init.js";
import { features, products } from "../global.js";
import { AutumnCli } from "../cli/AutumnCli.js";
import { assert, expect } from "chai";
import { timeout } from "../utils/genUtils.js";
import { completeCheckoutForm } from "../utils/stripeUtils.js";
import { getAxiosInstance } from "../utils/setup.js";
import chalk from "chalk";

const oneTimeQuantity = 2;
const oneTimePurchaseCount = 2;
const oneTimeOverrideQuantity = 4;
const monthlyQuantity = 2;

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "01_product: Testing attach -- free, pro & one-time / monthly add on",
)}`, () => {
  let customerId = "attach1";
  before(async function () {
    await initCustomer({
      customerId,
      db: this.db,
      org: this.org,
      env: this.env,
    });
  });

  describe("Create customer -- check free is active", () => {
    it("GET /customers/:id -- checking default product & entitlements", async function () {
      const axiosInstance = getAxiosInstance();
      const { data } = await axiosInstance.get(`/v1/customers/${customerId}`);

      compareMainProduct({
        sent: products.free,
        cusRes: data,
      });
    });

    it("GET /entitled -- metered1", async function () {
      // Checking metered1 entitlement
      const expectedEntitlement = products.free.entitlements.metered1;

      const entitled: any = await AutumnCli.entitled(
        customerId,
        features.metered1.id,
      );

      const metered1Balance = entitled!.balances.find(
        (balance: any) => balance.feature_id === features.metered1.id,
      );

      try {
        expect(entitled!.allowed).to.be.true;
        expect(metered1Balance).to.exist;
        expect(metered1Balance!.balance).to.equal(
          expectedEntitlement.allowance,
        );
        expect(metered1Balance!.unlimited).to.not.exist;
      } catch (error) {
        console.group();
        console.group();
        console.log("Looking for: ", expectedEntitlement);
        console.log("Received (entitled res): ", entitled);
        console.groupEnd();
        console.groupEnd();
        throw error;
      }
    });

    it("GET /entitled -- boolean1", async function () {
      const entitled = await AutumnCli.entitled(
        customerId,
        features.boolean1.id,
      );

      expect(entitled!.allowed).to.be.false;
    });
  });

  describe("Attach pro -- check products & entitlements", () => {
    it("POST /attach -- attaching pro (force checkout)", async function () {
      const res = await AutumnCli.attach({
        customerId: customerId,
        productId: products.pro.id,
      });

      assert.exists(res.checkout_url);

      await completeCheckoutForm(res.checkout_url);
      await timeout(10000); // for webhook to be processed
      console.log(`   ${chalk.greenBright("Attached pro")}`);
    });

    it("GET /customers/:id -- checking product & entitlements (pro)", async function () {
      const res = await AutumnCli.getCustomer(customerId);
      // console.log("Res: ", res);
      compareMainProduct({
        sent: products.pro,
        cusRes: res,
      });
      assert.isTrue(res.invoices.length > 0);
    });

    it("GET /entitled -- checking entitlements for metered1 && boolean1", async function () {
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
  });

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
