import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  CusProductStatus,
  Organization,
} from "@autumn/shared";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays } from "date-fns";
import { expectMultiAttachCorrect } from "tests/utils/expectUtils/expectMultiAttach.js";
import { products } from "tests/global.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { CusService } from "@/internal/customers/CusService.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { timeout } from "@/utils/genUtils.js";
import { expect } from "chai";

const testCase = "cancel1";
describe(`${chalk.yellowBright("cancel1: Testing cancel for trial products")}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

  let stripeCli: Stripe;
  let testClockId: string;
  let curUnix: number;
  let db: DrizzleCli;
  let org: Organization;
  let env: AppEnv;

  before(async function () {
    await setupBefore(this);
    const { autumnJs } = this;
    db = this.db;
    org = this.org;
    env = this.env;

    stripeCli = this.stripeCli;

    const { testClockId: testClockId1 } = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    testClockId = testClockId1!;
  });

  it("should attach pro", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: products.pro.id,
    });

    const customer = await autumn.customers.get(customerId);
    expectProductAttached({
      customer,
      productId: products.pro.id,
    });
  });

  let sub: Stripe.Subscription | undefined;

  it("should cancel pro product through stripe CLI", async function () {
    const fullCus = await CusService.getFull({
      db,
      idOrInternalId: customerId,
      orgId: org.id,
      env,
    });

    sub = await cusProductToSub({
      cusProduct: fullCus.customer_products?.[0],
      stripeCli,
    });

    await stripeCli.subscriptions.update(sub!.id, {
      cancel_at_period_end: true,
    });

    await timeout(4000);

    const customer = await autumn.customers.get(customerId);
    expectProductAttached({
      customer,
      productId: products.pro.id,
      isCanceled: true,
    });

    expectProductAttached({
      customer,
      productId: products.free.id,
      status: CusProductStatus.Scheduled,
    });
  });
  return;

  it("should renew pro produce through stripe CLI and have it update correctly", async function () {
    await stripeCli.subscriptions.update(sub!.id, {
      cancel_at_period_end: false,
    });

    await timeout(4000);

    const customer = await autumn.customers.get(customerId);
    expectProductAttached({
      customer,
      productId: products.pro.id,
      status: CusProductStatus.Active,
    });

    expect(customer.products.length).to.equal(1);
  });
});
