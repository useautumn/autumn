import { AutumnCli } from "tests/cli/AutumnCli.js";
import { attachProducts } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import chalk from "chalk";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { setupBefore } from "tests/before.js";
import { Customer } from "@autumn/shared";

/* 
FLOW:
1. Attach pro group 1 & pro group 2 at once -> should have both products as main
2. Upgrade pro group 1 -> premium group 1
3. Upgrade pro group 2 -> premium group 2
*/

const testCase = "multiProduct1";
describe(
  chalk.yellowBright(`${testCase}: Testing multi product attach, and upgrade`),
  () => {
    let customerId = testCase;
    let customer: Customer;
    before(async function () {
      await setupBefore(this);
      const res = await initCustomer({
        customerId,
        db: this.db,
        org: this.org,
        env: this.env,
        autumn: this.autumnJs,
        attachPm: "success",
      });
      customer = res.customer;
    });

    it("should attach pro group 1 and pro group 2", async function () {
      await AutumnCli.attach({
        customerId: customerId,
        productIds: [attachProducts.proGroup1.id, attachProducts.proGroup2.id],
      });

      let cusRes = await AutumnCli.getCustomer(customerId);
      compareMainProduct({ sent: attachProducts.proGroup1, cusRes });
      compareMainProduct({ sent: attachProducts.proGroup2, cusRes });
    });

    it("should upgrade to premium group 1", async function () {
      await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.premiumGroup1.id,
      });

      // 1. Compare main product
      const cusRes = await AutumnCli.getCustomer(customerId);
      compareMainProduct({ sent: attachProducts.premiumGroup1, cusRes });
    });

    it("should upgrade to premium group 2", async function () {
      await AutumnCli.attach({
        customerId: customerId,
        productId: attachProducts.premiumGroup2.id,
      });

      // 1. Compare main product
      const cusRes = await AutumnCli.getCustomer(customerId);
      compareMainProduct({ sent: attachProducts.premiumGroup2, cusRes });
    });
  },
);
