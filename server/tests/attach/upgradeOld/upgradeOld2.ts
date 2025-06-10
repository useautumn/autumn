import Stripe from "stripe";
import chalk from "chalk";
import { Customer } from "@autumn/shared";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { products } from "tests/global.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

describe(`${chalk.yellowBright(
  "upgradeOld2: Testing upgrade (paid to trial)",
)}`, () => {
  const customerId = "upgradeOld2";
  let testClockId: string;
  let customer: Customer;
  let autumn: AutumnInt = new AutumnInt();
  let stripeCli: Stripe;

  before(async function () {
    await setupBefore(this);
    stripeCli = this.stripeCli;
    const { customer: customer_, testClockId: testClockId_ } =
      await initCustomer({
        autumn: this.autumnJs,
        customerId,
        db: this.db,
        org: this.org,
        env: this.env,
        attachPm: "success",
      });

    customer = customer_;
    testClockId = testClockId_;
  });

  it("should attach pro", async function () {
    this.timeout(30000);
    await autumn.attach({
      customer_id: customerId,
      product_id: products.pro.id,
    });
  });

  it("should attach premium with trial and have trial", async function () {
    this.timeout(30000);

    await autumn.attach({
      customer_id: customerId,
      product_id: products.premiumWithTrial.id,
    });
  });
});
