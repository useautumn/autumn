import chalk from "chalk";
import { features } from "tests/global.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { timeout } from "tests/utils/genUtils.js";
import { initCustomer } from "tests/utils/init.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { compareMainProduct } from "tests/utils/compare.js";

describe(`${chalk.yellowBright(
  "attach2: Testing monthly with one time prepaid, quantity = 0"
)}`, () => {
  let customerId = "attach2";

  let options = [
    {
      feature_id: features.metered1.id,
      quantity: 0,
    },
    {
      feature_id: features.metered2.id,
      quantity: 4,
    },
  ];
  before(async function () {
    await initCustomer({
      customerId,
      sb: this.sb,
      org: this.org,
      env: this.env,
    });
  });

  it("should attach monthly with one time", async function () {
    const res = await AutumnCli.attach({
      customerId,
      productId: products.monthlyWithOneTime.id,
      options,
    });

    await completeCheckoutForm(res.checkout_url);
    await timeout(10000);
  });

  it("should have correct main product and entitlements", async function () {
    const cusRes = await AutumnCli.getCustomer(customerId);

    compareMainProduct({
      sent: products.monthlyWithOneTime,
      cusRes,
      optionsList: options,
    });
  });
});
