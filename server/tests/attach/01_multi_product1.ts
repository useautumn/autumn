import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { CusProductStatus } from "@autumn/shared";
import { expect } from "chai";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { attachProducts } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "tests/utils/init.js";
import { timeout } from "tests/utils/genUtils.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import chalk from "chalk";

/* 
FLOW:
1. Attach pro group 1 & pro group 2 at once -> should have both products as main
2. Upgrade pro group 1 -> premium group 1
3. Upgrade pro group 2 -> premium group 2
*/
describe(chalk.yellowBright("01_multi_product1: Testing multi product attach, and upgrade"), () => {
  let customerId = "multi-product-attach-upgrade";
  before(async function () {
    this.customer = await initCustomer({
      sb: this.sb,
      org: this.org,
      customer_data: {
        id: customerId,
        name: customerId,
        email: "multi-product-attach-upgrade@example.com",
      },
      env: this.env,
      attachPm: true,
    });
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

    // 2. Check latest invoice
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
});
