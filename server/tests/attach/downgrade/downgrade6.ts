import { Customer } from "@autumn/shared";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import chalk from "chalk";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setupBefore } from "tests/before.js";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";

const testCase = "downgrade6";
describe(`${chalk.yellowBright("downgrade6: testing expire button")}`, () => {
  let customerId = testCase;
  let testClockId: string;
  let autumn: AutumnInt = new AutumnInt();
  let customer: Customer;

  before(async function () {
    await setupBefore(this);

    const { testClockId: testClockId_, customer: customer_ } =
      await initCustomer({
        customerId,
        db: this.db,
        org: this.org,
        env: this.env,
        autumn: this.autumnJs,
      });

    customer = customer_;
    testClockId = testClockId_;
  });

  it("should attach premium", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: products.premium.id,
    });
  });

  it("should expire premium", async function () {
    const cusProduct = await getMainCusProduct({
      db: this.db,
      internalCustomerId: customer.internal_id,
    });

    await AutumnCli.expire(cusProduct!.id);
  });

  it("should have correct product and entitlements after expiration", async function () {
    const res = await AutumnCli.getCustomer(customerId);

    compareMainProduct({
      sent: products.free,
      cusRes: res,
    });
  });

  // // 2. Get premium
  // it("POST /attach -- attaching premium, then attach pro", async function () {
  //   this.timeout(30000);
  //   await AutumnCli.attach({
  //     customerId: customerId,
  //     productId: products.premium.id,
  //   });

  //   await AutumnCli.attach({
  //     customerId: customerId,
  //     productId: products.pro.id,
  //   });
  // });

  // it("Expiring pro product (should re-attach premium)", async function () {
  //   this.timeout(30000);

  //   // Expire pro product
  //   const customerProduct = await getCusProduct(
  //     this.sb,
  //     customer.internal_id,
  //     products.pro.id,
  //   );
  //   await AutumnCli.expire(customerProduct.id);
  //   await timeout(5000);
  // });

  // it("GET /customers/:customer_id -- checking product and ents", async function () {
  //   this.timeout(30000);
  //   // Check that free is attached
  //   const res = await AutumnCli.getCustomer(customerId);
  //   compareMainProduct({
  //     sent: products.premium,
  //     cusRes: res,
  //   });

  //   // Get stripe subscription (ensure canceled is null)
  //   const stripeCli = createStripeCli({
  //     org: this.org,
  //     env: this.env,
  //   });

  //   const premiumCusProduct = await getCusProduct(
  //     this.sb,
  //     customer.internal_id,
  //     products.premium.id,
  //   );

  //   const stripeSub = await stripeCli.subscriptions.retrieve(
  //     premiumCusProduct.processor.subscription_id,
  //   );

  //   // Check that canceled is null
  //   assert.isNull(stripeSub.canceled_at);
  // });
});
