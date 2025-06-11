import { assert } from "chai";
import { features, products } from "../global.js";
import { initCustomer } from "../utils/init.js";
import { getPublicAxiosInstance } from "../utils/setup.js";
import { completeCheckoutForm } from "../utils/stripeUtils.js";
import { timeout } from "../utils/genUtils.js";
import { ErrCode } from "@autumn/shared";
import { compareMainProduct } from "../utils/compare.js";
import { AutumnCli } from "../cli/AutumnCli.js";
import chalk from "chalk";

describe(`${chalk.yellowBright("08_pkey: Testing publishable key")}`, () => {
  // 1. Initialize customer with card
  let customerId = "pkeyTestCustomer";
  const bearerPublicAxios = getPublicAxiosInstance({
    withBearer: true,
  });

  before(async function () {
    this.timeout(30000);
    await initCustomer({
      customer_data: {
        id: customerId,
        name: customerId,
        email: "test@test.com",
        fingerprint: "fp1",
      },
      db: this.db,
      org: this.org,
      env: this.env,
      attachPm: true,
    });
  });

  it("should return a 401 if the pkey is invalid", async function () {
    this.timeout(30000);
    const axiosInstance = getPublicAxiosInstance({
      withBearer: true,
      pkey: "am_pk_test_invalid",
    });

    try {
      const { data } = await axiosInstance.post("/v1/attach", {
        customer_id: customerId,
        product_id: products.pro.id,
      });

      throw new Error("Should not be able to attach");
    } catch (error: any) {
      assert.equal(error.response.status, 401);
    }
  });

  it("should return checkout URL for both bearer key", async function () {
    this.timeout(30000);
    const axiosInstanceBearer = getPublicAxiosInstance({
      withBearer: true,
    });

    // 1. Should be able to upgrade to pro
    const { data } = await axiosInstanceBearer.post("/v1/attach", {
      customer_id: customerId,
      product_id: products.pro.id,
    });

    assert.exists(data.checkout_url);

    await completeCheckoutForm(data.checkout_url);

    await timeout(5000);
  });

  it("should have customer with product", async function () {
    this.timeout(30000);
    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.pro,
      cusRes: res,
    });
  });

  it("should return error if try to upgrade or downgrade without pkey", async function () {
    this.timeout(30000);
    const axiosInstance = getPublicAxiosInstance({
      withBearer: true,
    });

    try {
      await axiosInstance.post("/v1/attach", {
        customer_id: customerId,
        product_id: products.premium.id,
      });

      throw new Error("Should not be able to attach");
    } catch (error: any) {
      assert.equal(error.response.status, 400);
      assert.equal(error.response.data.code, ErrCode.InvalidRequest);
    }
  });

  it("should return error if try to downgrade to free", async function () {
    try {
      await bearerPublicAxios.post("/v1/attach", {
        customer_id: customerId,
        product_id: products.free.id,
      });

      throw new Error("Should not be able to attach");
    } catch (error: any) {
      assert.equal(error.response.status, 400);
      assert.equal(error.response.data.code, ErrCode.InvalidRequest);
    }
  });

  // Next, check entitled for pro
  it("should return correct metered1 amount for pro", async function () {
    const { data } = await bearerPublicAxios.post("/v1/entitled", {
      customer_id: customerId,
      feature_id: features.metered1.id,
    });

    assert.equal(data.allowed, true);
    const metered1Balance = data.balances.find(
      (b: any) => b.feature_id === features.metered1.id,
    );
    assert.equal(
      metered1Balance.balance,
      products.pro.entitlements.metered1.allowance,
    );
  });

  it("should return same balance for entitled with bearer and x-publishable-key", async function () {
    const { data } = await bearerPublicAxios.post("/v1/entitled", {
      customer_id: customerId,
      feature_id: features.metered1.id,
    });

    assert.equal(data.allowed, true);
    const metered1Balance = data.balances.find(
      (b: any) => b.feature_id === features.metered1.id,
    );
    assert.equal(
      metered1Balance.balance,
      products.pro.entitlements.metered1.allowance,
    );
  });

  it("should return error when try to send event", async function () {
    try {
      await bearerPublicAxios.post("/v1/events", {
        customer_id: customerId,
        event_name: features.metered1.id,
        properties: {
          value: 10,
        },
      });

      throw new Error("Should not be able to send event");
    } catch (error: any) {
      assert.equal(error.response.status, 401);
      assert.equal(error.response.data.code, ErrCode.EndpointNotPublic);
    }
  });
});
