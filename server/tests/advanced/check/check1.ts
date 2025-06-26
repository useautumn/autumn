import chalk from "chalk";
import Stripe from "stripe";
import { expect } from "chai";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { APIVersion, Customer, LimitedItem } from "@autumn/shared";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { createProducts } from "tests/utils/productUtils.js";
import { Decimal } from "decimal.js";
import { timeout } from "@/utils/genUtils.js";

const creditCost = 0.2;
let freeProduct = constructProduct({
  id: "free",
  items: [constructFeatureItem({ featureId: TestFeature.Action1 })],
  type: "free",
  isDefault: false,
});

const creditFeatureItem = constructFeatureItem({
  featureId: TestFeature.Credits,
}) as LimitedItem;
let pro = constructProduct({
  id: "pro",
  items: [creditFeatureItem],
  type: "pro",
});

const testCase = "check1";
describe(`${chalk.yellowBright("check1: Checking credit systems")}`, () => {
  const customerId = testCase;
  let testClockId: string;
  let customer: Customer;
  let stripeCli: Stripe;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

  before(async function () {
    await setupBefore(this);
    stripeCli = this.stripeCli;

    const { customer: customer_, testClockId: testClockId_ } =
      await initCustomer({
        customerId,
        org: this.org,
        env: this.env,
        db: this.db,
        autumn: this.autumnJs,
        attachPm: "success",
      });

    addPrefixToProducts({
      products: [freeProduct, pro],
      prefix: testCase,
    });
    await createProducts({
      products: [freeProduct, pro],
      orgId: this.org.id,
      env: this.env,
      autumn: this.autumnJs,
      db: this.db,
    });

    customer = customer_;
    testClockId = testClockId_;
  });

  it("should attach free product and check action1 allowed", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: freeProduct.id,
    });

    let actionCheck = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Action1,
    });

    let creditsCheck = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Credits,
    });

    expect(actionCheck.allowed).to.be.true;
    expect(creditsCheck.allowed).to.be.false;
  });

  it("should attach pro product and check allowed", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
    });

    let creditsCheck = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Credits,
    });

    let actionCheck = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Action1,
    });

    expect(actionCheck.allowed).to.be.true;
    expect(creditsCheck.allowed).to.be.true;
  });

  it("should use up credits and have correct check response", async function () {
    let usage = 50;
    let creditUsage = new Decimal(creditCost).mul(usage).toNumber();

    let creditBalance = new Decimal(creditFeatureItem.included_usage)
      .sub(creditUsage)
      .toNumber();

    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Action1,
      value: usage,
    });

    await timeout(3000);

    let creditsCheck = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Credits,
    });

    expect(creditsCheck.balance).to.be.equal(creditBalance);
  });
});
