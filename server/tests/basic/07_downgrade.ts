import { CusProductStatus, Customer } from "@autumn/shared";
import { initCustomer } from "../utils/init.js";
import { AutumnCli } from "../cli/AutumnCli.js";
import { products } from "../global.js";
import { assert } from "chai";
import chalk from "chalk";
import { compareMainProduct } from "../utils/compare.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { addDays } from "date-fns";
import { timeout } from "../utils/genUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";

export const getCusProduct = async (
  sb: SupabaseClient,
  internalCustomerId: string,
  productId: string
) => {
  const { data, error } = await sb
    .from("customer_products")
    .select("*")
    .eq("internal_customer_id", internalCustomerId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) {
    return null;
  }

  return data[0];
};

describe(`${chalk.yellowBright("Testing downgrade (paid to paid)")}`, () => {
  let customer: Customer;
  let customerId = "downgrade";
  let testClockId: string;
  before(async function () {
    this.timeout(30000);
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });
    const testClock = await stripeCli.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });

    customer = await initCustomer({
      customer_data: {
        id: customerId,
        name: "Test Customer",
        email: "test@test.com",
        fingerprint: "fp1",
      },
      sb: this.sb,
      org: this.org,
      env: this.env,
      attachPm: true,
      testClockId: testClock.id,
    });
    testClockId = testClock.id;
  });

  it("POST /attach -- attaching premium", async function () {
    this.timeout(30000);
    const res = await AutumnCli.attach({
      customerId: customerId,
      productId: products.premium.id,
    });

    console.log(`   ${chalk.greenBright("Attached premium")}`);
  });

  // 1. Try force checkout...
  it("POST /attach -- attaching pro", async function () {
    this.timeout(30000);
    await AutumnCli.attach({
      customerId: customerId,
      productId: products.pro.id,
    });
  });

  // Check that pro is scheduled

  it("GET /customers/:customer_id -- checking product and ents", async function () {
    this.timeout(30000);
    const res = await AutumnCli.getCustomer(customerId);

    compareMainProduct({
      sent: products.premium,
      cusRes: res,
    });

    const { products: resProducts } = res;

    const resPro = resProducts.find(
      (p: any) =>
        p.id === products.pro.id && p.status === CusProductStatus.Scheduled
    );
    assert.isNotNull(resPro);
  });

  // Advance time 1 month
  it("Advancing stripe clock and seeing if pro is attached", async function () {
    this.timeout(30000);
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });

    const advanceTo = addDays(new Date(), 32).getTime() / 1000;
    await stripeCli.testHelpers.testClocks.advance(testClockId, {
      frozen_time: Math.floor(advanceTo),
    });

    await timeout(20000);

    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.pro,
      cusRes: res,
    });
  });
});

describe(`${chalk.yellowBright("Testing expire button")}`, () => {
  let customer: Customer;
  let customerId = "expire";
  let testClockId: string;

  before(async function () {
    this.timeout(30000);
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });
    const { testClockId: testClockId_, customer: customer_ } =
      await initCustomerWithTestClock({
        customerId,
        org: this.org,
        env: this.env,
        sb: this.sb,
      });

    customer = customer_;
    testClockId = testClockId_;
  });

  it("POST /attach -- attaching premium", async function () {
    this.timeout(30000);
    await AutumnCli.attach({
      customerId: customerId,
      productId: products.premium.id,
    });
  });

  it("POST /expire -- expiring premium", async function () {
    this.timeout(30000);

    const customerProduct = await getCusProduct(
      this.sb,
      customer.internal_id,
      products.premium.id
    );

    await AutumnCli.expire(customerProduct.id);
    await timeout(5000);
  });

  // Check that active product is free
  it("GET /customers/:customer_id -- checking product and ents", async function () {
    this.timeout(30000);
    const res = await AutumnCli.getCustomer(customerId);

    compareMainProduct({
      sent: products.free,
      cusRes: res,
    });
  });

  // 2. Get premium
  it("POST /attach -- attaching premium, then attach pro", async function () {
    this.timeout(30000);
    await AutumnCli.attach({
      customerId: customerId,
      productId: products.premium.id,
    });

    await AutumnCli.attach({
      customerId: customerId,
      productId: products.pro.id,
    });
  });

  it("Expiring pro product (should re-attach premium)", async function () {
    this.timeout(30000);

    // Expire pro product
    const customerProduct = await getCusProduct(
      this.sb,
      customer.internal_id,
      products.pro.id
    );
    await AutumnCli.expire(customerProduct.id);
    await timeout(5000);
  });

  it("GET /customers/:customer_id -- checking product and ents", async function () {
    this.timeout(30000);
    // Check that free is attached
    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.premium,
      cusRes: res,
    });

    // Get stripe subscription (ensure canceled is null)
    const stripeCli = createStripeCli({
      org: this.org,
      env: this.env,
    });

    const premiumCusProduct = await getCusProduct(
      this.sb,
      customer.internal_id,
      products.premium.id
    );

    const stripeSub = await stripeCli.subscriptions.retrieve(
      premiumCusProduct.processor.subscription_id
    );

    // Check that canceled is null
    assert.isNull(stripeSub.canceled_at);
  });

  // TEST TODO: Expire add-on
});
