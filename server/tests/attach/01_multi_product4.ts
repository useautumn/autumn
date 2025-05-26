import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { CusProductStatus } from "@autumn/shared";
import { expect } from "chai";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { attachProducts } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "tests/utils/init.js";
import { searchCusProducts, timeout } from "tests/utils/genUtils.js";
import chalk from "chalk";

// TESTING DOWNGRADE DOWNGRADE THEN
// 1. UPGRADE FIRST PRODUCT BACK -- SHOULD REPLACE SCHEDULE WITH OLD FIRST PRODUCT
// 2. UPGRADE SECOND PRODUCT BACK -- SHOULD CANCEL SCHEDULE

describe(
  chalk.yellowBright(
    "Multi Product 4: double downgrade, double upgrade (back)",
  ),
  () => {
    let customerId = "multi-double-downgrade-upgrade";
    let customer;

    let stripeCli;

    before(async function () {
      customer = await initCustomer({
        sb: this.sb,
        org: this.org,
        env: this.env,
        customer_data: {
          id: customerId,
          name: customerId,
          email: "multi-product-upgrade-test@example.com",
        },
        attachPm: true,
      });

      stripeCli = createStripeCli({
        org: this.org,
        env: this.env,
      });
    });

    it("should attach premium group 1 and premium group 2", async function () {
      let res = await AutumnCli.attach({
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
      let res = await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.starterGroup1.id,
      });

      await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.starterGroup2.id,
      });
    });

    it("should reattach premium group 1", async function () {
      await timeout(3000);
      await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.premiumGroup1.id,
      });

      // Check that schedule contains premium group 1, and starter group 2...

      const cusProducts = await CusProductService.list({
        db: this.db,
        internalCustomerId: customer!.internal_id,
      });

      // 1. Check that premium group 1 is active, and had scheduled_ids
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

      await timeout(5000);

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

    // it("should reattach premium group 2", async function () {
    //   let res = await AutumnCli.attach({
    //     customerId: this.customer.id,
    //     productId: attachProducts.premiumGroup2.id,
    //   });
    // });
  },
);
