import { Customer } from "@autumn/shared";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import chalk from "chalk";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setupBefore } from "tests/before.js";
import { findCusProductById } from "@/internal/customers/cusProducts/cusProductUtils/findCusProduct.js";
import { expect } from "chai";
import { getSubsFromCusId } from "tests/utils/expectUtils/expectSubUtils.js";

const testCase = "downgrade7";
describe(`${chalk.yellowBright("downgrade7: testing expire scheduled product")}`, () => {
  let customerId = testCase;
  let testClockId: string;
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
        attachPm: "success",
      });

    customer = customer_;
    testClockId = testClockId_;
  });

  // 2. Get premium
  it("should attach premium, then attach pro", async function () {
    await AutumnCli.attach({
      customerId: customerId,
      productId: products.premium.id,
    });

    await AutumnCli.attach({
      customerId: customerId,
      productId: products.pro.id,
    });
  });

  it("should expire scheduled product (pro)", async function () {
    const cusProduct = await findCusProductById({
      db: this.db,
      internalCustomerId: customer.internal_id,
      productId: products.pro.id,
    });

    expect(cusProduct).to.exist;
    await AutumnCli.expire(cusProduct!.id);
  });

  it("should have correct product and entitlements (premium)", async function () {
    this.timeout(30000);
    // Check that free is attached
    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.premium,
      cusRes: res,
    });

    const { subs } = await getSubsFromCusId({
      stripeCli: this.stripeCli,
      customerId: customerId,
      productId: products.premium.id,
      db: this.db,
      org: this.org,
      env: this.env,
    });
    expect(subs).to.have.lengthOf(1);
    expect(subs[0].canceled_at).to.be.null;
  });
});
