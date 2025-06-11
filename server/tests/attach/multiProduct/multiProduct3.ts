import chalk from "chalk";

import { expect } from "chai";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { attachProducts } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { searchCusProducts, timeout } from "tests/utils/genUtils.js";

import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { setupBefore } from "tests/before.js";
import Stripe from "stripe";

// TESTING DOWNGRADE DOWNGRADE THEN
// 1. UPGRADE FIRST PRODUCT BACK -- SHOULD REPLACE SCHEDULE WITH OLD FIRST PRODUCT
// 2. UPGRADE SECOND PRODUCT BACK -- SHOULD CANCEL SCHEDULE

const testCase = "multiProduct3";
describe(
  chalk.yellowBright(`${testCase}: double downgrade, double upgrade (back)`),
  () => {
    let customerId = testCase;
    let customer;
    let stripeCli: Stripe;

    before(async function () {
      await setupBefore(this);
      stripeCli = this.stripeCli;
      const res = await initCustomer({
        db: this.db,
        org: this.org,
        env: this.env,
        customerId,
        autumn: this.autumnJs,
        attachPm: "success",
      });

      customer = res.customer;
    });

    it("should attach premium group 1 and premium group 2", async function () {
      await AutumnCli.attach({
        customerId: customerId,
        productIds: [
          attachProducts.premiumGroup1.id,
          attachProducts.premiumGroup2.id,
        ],
      });

      let cusRes = await AutumnCli.getCustomer(customerId);
      compareMainProduct({ sent: attachProducts.premiumGroup1, cusRes });
      compareMainProduct({ sent: attachProducts.premiumGroup2, cusRes });
    });

    it("should attach starter group 1, then starter group 2", async function () {
      await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.starterGroup1.id,
      });

      await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.starterGroup2.id,
      });
    });

    it("should reattach premium group 1", async function () {
      await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.premiumGroup1.id,
      });

      await timeout(10000);

      const cusProducts = await CusProductService.list({
        db: this.db,
        internalCustomerId: customer!.internal_id,
      });

      let premiumGroup1 = searchCusProducts({
        cusProducts,
        productId: attachProducts.premiumGroup1.id,
      });

      let starterGroup2 = searchCusProducts({
        cusProducts,
        productId: attachProducts.starterGroup2.id,
      });

      expect(premiumGroup1!.scheduled_ids!.length).to.equal(1);
      expect(starterGroup2!.scheduled_ids!.length).to.equal(1);
      expect(premiumGroup1!.scheduled_ids![0]).to.equal(
        starterGroup2!.scheduled_ids![0],
      );

      // 2. Check that there's no starter group 1
      let starterGroup1 = searchCusProducts({
        cusProducts,
        productId: attachProducts.starterGroup1.id,
      });

      expect(starterGroup1).to.not.exist;

      // 3. TODO: check that in Stripe schedule, premium group 1 and starter group 2 are scheduled
    });

    it("should reattach premium group 2 (scheduled should be cancelled)", async function () {
      await timeout(3000);
      let res = await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.premiumGroup2.id,
      });

      await timeout(10000);

      const cusProducts = await CusProductService.list({
        db: this.db,
        internalCustomerId: customer!.internal_id,
      });

      let premiumGroup2 = searchCusProducts({
        cusProducts,
        productId: attachProducts.premiumGroup2.id,
      });

      let premiumGroup1 = searchCusProducts({
        cusProducts,
        productId: attachProducts.premiumGroup1.id,
      });

      expect(premiumGroup2).to.exist.and.have.property("scheduled_ids");
      expect(premiumGroup1).to.exist.and.have.property("scheduled_ids");
      expect(premiumGroup2!.scheduled_ids!.length).to.equal(0);
      expect(premiumGroup1!.scheduled_ids!.length).to.equal(0);

      // Check that subscription is activated
      let stripeCli = createStripeCli({
        org: this.org,
        env: this.env,
      });

      let subs = await getStripeSubs({
        stripeCli,
        subIds: premiumGroup1!.subscription_ids!,
      });

      let sub = subs[0];
      expect(sub.canceled_at).to.equal(null);
      expect(sub.cancel_at).to.equal(null);
      expect(sub.status).to.equal("active");
    });
  },
);
