import dotenv from "dotenv";
dotenv.config();

import * as chai from "chai";
import { default as chaiHttp, request } from "chai-http";
import { createClerkCli } from "../src/external/clerkUtils.js";
import { createSupabaseClient } from "../src/external/supabaseUtils.js";
import {
  AllowanceType,
  AppEnv,
  BillingInterval,
  CusProductStatus,
  EntInterval,
  Feature,
  FeatureType,
  Organization,
  PriceType,
} from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import axios from "axios";
import { expect } from "chai";

import { createStripeCli } from "@/external/stripe/utils.js";
import { attachPmToCus } from "@/external/stripe/stripeCusUtils.js";

const ORG_SLUG = "unit-test-org";
const AUTUMN_API_KEY = "am_test_3ZnkWSjVEpVGjLokP6HnP7t6";
const clerkCli = createClerkCli();
const sb = createSupabaseClient();
const env = AppEnv.Sandbox;

const axiosInstance = axios.create({
  baseURL: "http://localhost:8080",
  headers: {
    Authorization: `Bearer ${AUTUMN_API_KEY}`,
  },
});

const timeout = async (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

chai.use(chaiHttp);

const vars = {
  customer_id: "test-customer",
  metered_1: {
    id: "metered-1",
    event_name: "metered_1_event",
    credit_amount: 1,
  },
  metered_2: {
    id: "metered-2",
    event_name: "metered_2_event",
    credit_amount: 5,
  },
  credits_1: {
    id: "credits-1",
    event_name: "credits_1_event",
  },
  free: {
    id: "free",
    metered_1_allowance: 3,
    metered_2_allowance: 2,
    credits_1_allowance: 11,
  },
  pro: {
    id: "pro",
    metered_1_allowance: "unlimited",
    metered_2_allowance: "unlimited",
    credits_1_allowance: 100,
  },
};

const clearOrg = async ({ orgId, env }: { orgId: string; env: AppEnv }) => {
  // 1. Delete all customers
  const { error } = await sb
    .from("customers")
    .delete()
    .eq("org_id", orgId)
    .eq("env", env);

  // 2. Delete all products
  const { error: productError } = await sb
    .from("products")
    .delete()
    .eq("org_id", orgId)
    .eq("env", env);
  if (productError) {
    console.error("Error deleting products:", productError);
  }

  // // 3. Delete all features
  await sb.from("features").delete().eq("org_id", orgId).eq("env", env);
};

const setupOrg = async (org: Organization, env: AppEnv) => {
  // 1. Create features
  const features: Feature[] = [
    {
      id: "boolean-1",
      name: "Boolean 1",
      type: FeatureType.Boolean,
    },
    {
      id: "metered-1",
      name: "Metered 1",
      type: FeatureType.Metered,
      config: {
        filters: [
          {
            value: ["metered_1_event"],
            property: "",
            operator: "",
          },
        ],
        aggregate: {
          type: "count",
          property: null,
        },
      },
    },
    {
      id: "metered-2",
      name: "Metered 2",
      type: FeatureType.Metered,
      config: {
        filters: [
          {
            value: ["metered_2_event"],
            property: "",
            operator: "",
          },
        ],
        aggregate: {
          type: "sum",
          property: "value",
        },
      },
    },
    {
      id: "credits-1",
      name: "Credits 1",
      type: FeatureType.CreditSystem,
      config: {
        schema: [
          {
            metered_feature_id: "metered-1",
            feature_amount: 1,
            credit_amount: vars.metered_1.credit_amount,
          },
          {
            metered_feature_id: "metered-2",
            feature_amount: 1,
            credit_amount: vars.metered_2.credit_amount,
          },
        ],
      },
    },
  ];

  let insertFeatures = [];
  for (const feature of features) {
    insertFeatures.push(axiosInstance.post("/v1/features", feature));
  }

  await Promise.all(insertFeatures);

  const { data: newFeatures } = await sb
    .from("features")
    .select("*")
    .eq("org_id", org.id)
    .eq("env", env);

  console.log(
    "✅ Inserted features (boolean-1, metered-1, metered-2, credits-1"
  );

  // 2. Create products
  const products: any[] = [
    // A. free product (3 metered-1, 1 metered-2, 5)
    {
      id: "free",
      name: "Free",
      group: "g1",
      is_add_on: false,
      is_default: true,
      prices: [],
      entitlements: [
        {
          feature_id: "metered-1",
          allowance_type: AllowanceType.Fixed,
          allowance: vars.free.metered_1_allowance,
          interval: EntInterval.Month,
          internal_feature_id: newFeatures?.find((f) => f.id === "metered-1")
            ?.internal_id,
        },
        {
          feature_id: "metered-2",
          allowance_type: AllowanceType.Fixed,
          allowance: vars.free.metered_2_allowance,
          interval: EntInterval.Month,
          internal_feature_id: newFeatures?.find((f) => f.id === "metered-2")
            ?.internal_id,
        },
        {
          feature_id: "credits-1",
          allowance_type: AllowanceType.Fixed,
          allowance: vars.free.credits_1_allowance,
          interval: EntInterval.Month,
          internal_feature_id: newFeatures?.find((f) => f.id === "credits-1")
            ?.internal_id,
        },
      ],
    },

    // B. pro product (20 USD / month) (Unlimited metered-1, Unlimited metered-2, 10 credits-1), 7 day free trial
    {
      id: "pro",
      name: "Pro",
      group: "g1",
      is_add_on: false,
      is_default: false,
      prices: [
        {
          name: "Monthly",
          config: {
            type: PriceType.Fixed,
            amount: 20,
            interval: BillingInterval.Month,
          },
        },
      ],
      entitlements: [
        {
          feature_id: "boolean-1",
          internal_feature_id: newFeatures?.find((f) => f.id === "boolean-1")
            ?.internal_id,
        },
        {
          feature_id: "metered-1",
          allowance_type: AllowanceType.Unlimited,
          allowance: null,
          interval: EntInterval.Month,
          internal_feature_id: newFeatures?.find((f) => f.id === "metered-1")
            ?.internal_id,
        },
        {
          feature_id: "metered-2",
          allowance_type: AllowanceType.Unlimited,
          allowance: null,
          interval: EntInterval.Month,
          internal_feature_id: newFeatures?.find((f) => f.id === "metered-2")
            ?.internal_id,
        },
        {
          feature_id: "credits-1",
          allowance_type: AllowanceType.Fixed,
          allowance: vars.pro.credits_1_allowance,
          interval: EntInterval.Month,
          internal_feature_id: newFeatures?.find((f) => f.id === "credits-1")
            ?.internal_id,
        },
      ],
      free_trial: {
        length: 7,
        unique_fingerprint: true,
      },
    },
  ];

  let insertProducts = [];
  for (const product of products) {
    const insertProduct = async () => {
      await axiosInstance.post("/v1/products", {
        product: {
          id: product.id,
          name: product.name,
          group: product.group,
          is_add_on: product.is_add_on,
          is_default: product.is_default,
        },
      });

      await axiosInstance.post(`/v1/products/${product.id}`, {
        prices: product.prices,
        entitlements: product.entitlements,
        free_trial: product.free_trial,
      });
    };

    insertProducts.push(insertProduct());
  }

  await Promise.all(insertProducts);

  console.log("✅ Inserted products (free, pro)");

  // Create test customer
  const { data } = await axiosInstance.post("/v1/customers", {
    id: vars.customer_id,
    email: "test@test.com",
    name: "Test Customer",
    fingerprint: "test-fp",
  });

  console.log("✅ Created test customer");
  return { customer: data.customer };
};

before(async function () {
  console.log("Running setup");
  this.timeout(5000);

  const org = await OrgService.getBySlug({ sb, slug: ORG_SLUG });
  this.org = org;

  await clearOrg({ orgId: org.id, env });
  const { customer } = await setupOrg(org, env);
  this.customer = customer;

  console.log("--------------------------------");
});

describe("Free tier -- checking balances before any usage", () => {
  it("boolean-1", async function () {
    const { data: boolean1Data } = await axiosInstance.post(`/v1/entitled`, {
      customer_id: vars.customer_id,
      feature_id: "boolean-1",
    });
    expect(boolean1Data.allowed).to.equal(false);
  });

  it("metered-1 / credits-1", async function () {
    // 2. Check metered-1 feature
    const { data: metered1Data } = await axiosInstance.post(`/v1/entitled`, {
      customer_id: vars.customer_id,
      feature_id: vars.metered_1.id,
    });

    // 1. Check that metered-1 balance is 3
    let metered1Balance = metered1Data.balances.find(
      (b: any) => b.feature_id === vars.metered_1.id
    );
    expect(metered1Balance.balance).to.equal(vars.free.metered_1_allowance);

    // 2. Check that metered-2 balance is 0
    let creditsBalance = metered1Data.balances.find(
      (b: any) => b.feature_id === vars.credits_1.id
    );
    expect(creditsBalance.balance).to.equal(vars.free.credits_1_allowance);
  });

  it("metered-2 / credits-1", async function () {
    const { data: metered2Data } = await axiosInstance.post(`/v1/entitled`, {
      customer_id: vars.customer_id,
      feature_id: vars.metered_2.id,
    });

    let metered2Balance = metered2Data.balances.find(
      (b: any) => b.feature_id === vars.metered_2.id
    );
    expect(metered2Balance.balance).to.equal(vars.free.metered_2_allowance);

    let creditsBalance = metered2Data.balances.find(
      (b: any) => b.feature_id === vars.credits_1.id
    );
    expect(creditsBalance.balance).to.equal(vars.free.credits_1_allowance);
  });
});

describe("Free tier -- checking balances after metered-1 / metered-2 events", () => {
  before(async function () {
    console.log(
      `   - Sending ${vars.free.metered_1_allowance} metered-1 events`
    );
    console.log(`   - Sending 1 metered-2 events`);

    this.timeout(10000);
    const sendEvents = [];
    for (let i = 0; i < vars.free.metered_1_allowance; i++) {
      sendEvents.push(
        axiosInstance.post(`/v1/events`, {
          customer_id: vars.customer_id,
          event_name: vars.metered_1.event_name,
        })
      );
    }

    sendEvents.push(
      axiosInstance.post(`/v1/events`, {
        customer_id: vars.customer_id,
        event_name: vars.metered_2.event_name,
        properties: {
          value: 1,
        },
      })
    );

    await Promise.all(sendEvents);
    await timeout(2000);
  });

  it("metered-1 / credits-1", async function () {
    const { data: metered1Data } = await axiosInstance.post(`/v1/entitled`, {
      customer_id: vars.customer_id,
      feature_id: vars.metered_1.id,
    });

    const metered1Balance = metered1Data.balances.find(
      (b: any) => b.feature_id === vars.metered_1.id
    );

    const creditsBalance = metered1Data.balances.find(
      (b: any) => b.feature_id === vars.credits_1.id
    );

    const expectedCreditsBalance =
      vars.free.credits_1_allowance -
      vars.free.metered_1_allowance -
      vars.metered_2.credit_amount;

    expect(metered1Balance.balance).to.equal(0);
    expect(creditsBalance.balance).to.equal(expectedCreditsBalance);
    expect(metered1Data.allowed).to.equal(false);
  });

  it("metered-2 / credits-1", async function () {
    const { data: metered2Data } = await axiosInstance.post(`/v1/entitled`, {
      customer_id: vars.customer_id,
      feature_id: vars.metered_2.id,
    });

    const metered2Balance = metered2Data.balances.find(
      (b: any) => b.feature_id === vars.metered_2.id
    );

    const expectedMetered2Balance = vars.free.metered_2_allowance - 1;

    expect(metered2Balance.balance).to.equal(expectedMetered2Balance);
    expect(metered2Data.allowed).to.equal(false);
  });
});

// CASE: Customer upgrades to pro, receives credits
describe("Upgrade to pro -- checking products & balances", () => {
  before(async function () {
    // 1. Attach payment method to customer
    this.timeout(10000);
    const org = this.org;
    const customer = this.customer;

    const stripeCli = createStripeCli({ org, env });

    try {
      if (!customer.processor || !customer.processor.id) {
        const stripeCus = await stripeCli.customers.create({
          email: customer.email,
          name: customer.name,
        });

        customer.processor = {
          id: stripeCus.id,
          type: "stripe",
        };

        const { error } = await sb
          .from("customers")
          .update({
            processor: {
              id: stripeCus.id,
              type: "stripe",
            },
          })
          .eq("internal_id", customer.internal_id);

        if (error) {
          console.log("   - Error updating customer:", error);
        }
      }

      await attachPmToCus(stripeCli, customer.processor.id);
      console.log("   - Attached payment method");
      // 2. Attach product
      const { data } = await axiosInstance.post(`/v1/attach`, {
        customer_id: customer.id,
        product_id: vars.pro.id,
      });

      if (data.checkout_url) {
        console.log("   - Checkout URL:", data.checkout_url);
        throw new Error("checkout_url received");
      }

      console.log("   - Attached product");
    } catch (error) {
      console.log("   - Error attaching payment method", error);
    }
  });

  it("on pro product", async function () {
    const { data } = await axiosInstance.get(
      `/v1/customers/${vars.customer_id}`
    );
    const products = data.products;

    expect(products.length).to.equal(1);
    expect(products[0].id).to.equal(vars.pro.id);
    expect(products[0].status).to.equal(CusProductStatus.Trialing);
  });

  it("boolean-1", async function () {
    const { data: boolean1Data } = await axiosInstance.post(`/v1/entitled`, {
      customer_id: vars.customer_id,
      feature_id: "boolean-1",
    });
    expect(boolean1Data.allowed).to.equal(true);
  });

  it("metered-1 / metered-2 / credits-1", async function () {
    const { data: metered1Data } = await axiosInstance.post(`/v1/entitled`, {
      customer_id: vars.customer_id,
      feature_id: vars.metered_1.id,
    });

    const { data: metered2Data } = await axiosInstance.post(`/v1/entitled`, {
      customer_id: vars.customer_id,
      feature_id: vars.metered_2.id,
    });

    const metered1Balance = metered1Data.balances.find(
      (b: any) => b.feature_id === vars.metered_1.id
    );
    const metered2Balance = metered2Data.balances.find(
      (b: any) => b.feature_id === vars.metered_2.id
    );

    const creditBalance = metered1Data.balances.find(
      (b: any) => b.feature_id === vars.credits_1.id
    );

    expect(metered1Balance.unlimited).to.equal(true);
    expect(metered2Balance.unlimited).to.equal(true);
    expect(creditBalance.balance).to.equal(vars.pro.credits_1_allowance);
    expect(metered1Data.allowed).to.equal(true);
    expect(metered2Data.allowed).to.equal(true);
  });
});

// describe("Downgrade to free", () => {
//   before(async function () {
//     this.timeout(10000);
//     await axiosInstance.post(`/v1/attach`, {
//       customer_id: vars.customer_id,
//       product_id: vars.free.id,
//     });
//     await timeout(3000);
//     console.log("   - Attached free product");
//   });

//   it("Checking free product scheduled", async function () {
//     const { data: products } = await axiosInstance.get(
//       `/v1/customers/${vars.customer_id}/products`
//     );

//     expect(products.length).to.equal(2);
//     const freeProduct = products.find((p: any) => p.id === vars.free.id);
//     expect(freeProduct.status).to.equal(CusProductStatus.Scheduled);
//     expect(freeProduct.canceled_at).to.equal(null);

//     const proProduct = products.find((p: any) => p.id === vars.pro.id);
//     expect(proProduct.status).to.equal(CusProductStatus.Active);
//     expect(proProduct.canceled_at).to.not.equal(null);
//   });

//   it("boolean-1", async function () {
//     const { data: boolean1Data } = await axiosInstance.post(`/v1/entitled`, {
//       customer_id: vars.customer_id,
//       feature_id: "boolean-1",
//     });
//     expect(boolean1Data.allowed).to.equal(true);
//   });

//   it("metered-1 / metered-2 / credits-1", async function () {
//     const { data: metered1Data } = await axiosInstance.post(`/v1/entitled`, {
//       customer_id: vars.customer_id,
//       feature_id: vars.metered_1.id,
//     });

//     const { data: metered2Data } = await axiosInstance.post(`/v1/entitled`, {
//       customer_id: vars.customer_id,
//       feature_id: vars.metered_2.id,
//     });

//     const metered1Balance = metered1Data.balances.find(
//       (b: any) => b.feature_id === vars.metered_1.id
//     );
//     const metered2Balance = metered2Data.balances.find(
//       (b: any) => b.feature_id === vars.metered_2.id
//     );

//     const creditBalance = metered1Data.balances.find(
//       (b: any) => b.feature_id === vars.credits_1.id
//     );

//     expect(metered1Balance.unlimited).to.equal(true);
//     expect(metered1Data.allowed).to.equal(true);

//     expect(metered2Balance.unlimited).to.equal(true);
//     expect(metered2Data.allowed).to.equal(true);

//     expect(creditBalance.balance).to.equal(vars.pro.credits_1_allowance);
//   });
// });

// describe("Restore to pro", () => {
//   before(async function () {
//     this.timeout(10000);
//     await axiosInstance.post(`/v1/attach`, {
//       customer_id: vars.customer_id,
//       product_id: vars.pro.id,
//     });
//     await timeout(3000);
//     console.log("   - Attached pro product");
//   });

//   it("Pro product active", async function () {
//     this.timeout(10000);

//     const { data: products } = await axiosInstance.get(
//       `/v1/customers/${vars.customer_id}/products`
//     );

//     expect(products.length).to.equal(1);
//     expect(products[0].id).to.equal(vars.pro.id);
//     expect(products[0].status).to.equal(CusProductStatus.Active);
//     expect(products[0].canceled_at).to.equal(null);
//   });
// });

// STRIPE CANCELLATION
describe("Stripe cancellation", () => {
  before(async function () {
    this.timeout(10000);
    const stripeCli = createStripeCli({ org: this.org, env });

    // 1. Cancel pro product
    const { data } = await axiosInstance.get(
      `/v1/customers/${vars.customer_id}`
    );
    const products = data.products;
    const proProduct = products.find((p: any) => p.id === vars.pro.id);

    await stripeCli.subscriptions.update(
      proProduct.processor.subscription_id!,
      {
        cancel_at_period_end: true,
      }
    );

    await timeout(3000);
    console.log("   - Cancelled pro product");
  });

  it("Pro product cancelled", async function () {
    const { data } = await axiosInstance.get(
      `/v1/customers/${vars.customer_id}`
    );
    const products = data.products;

    const proProduct = products.find((p: any) => p.id === vars.pro.id);

    expect(proProduct.status).to.equal(CusProductStatus.Trialing);
    expect(proProduct.canceled_at).to.not.equal(null);
  });
});

describe("Stripe renewal", () => {
  before(async function () {
    this.timeout(10000);
    const stripeCli = createStripeCli({ org: this.org, env });

    // 1. Enable pro product
    const { data } = await axiosInstance.get(
      `/v1/customers/${vars.customer_id}`
    );
    const products = data.products;
    const proProduct = products.find((p: any) => p.id === vars.pro.id);

    await stripeCli.subscriptions.update(
      proProduct.processor.subscription_id!,
      {
        cancel_at_period_end: false,
      }
    );

    await timeout(3000);
    console.log("   - Enabled pro product");
  });

  it("Pro product active", async function () {
    const { data } = await axiosInstance.get(
      `/v1/customers/${vars.customer_id}`
    );
    const products = data.products;
    const proProduct = products.find((p: any) => p.id === vars.pro.id);
    expect(proProduct.status).to.equal(CusProductStatus.Trialing);
    expect(proProduct.canceled_at).to.equal(null);
  });
});

describe("Stripe cancel now", () => {
  before(async function () {
    this.timeout(10000);
    const stripeCli = createStripeCli({ org: this.org, env });

    // 1. Cancel pro product
    const { data } = await axiosInstance.get(
      `/v1/customers/${vars.customer_id}`
    );
    const products = data.products;
    const proProduct = products.find((p: any) => p.id === vars.pro.id);

    await stripeCli.subscriptions.cancel(proProduct.processor.subscription_id!);

    await timeout(3000);
    console.log("   - Cancelled pro product");
  });

  it("Pro product cancelled", async function () {
    const { data } = await axiosInstance.get(
      `/v1/customers/${vars.customer_id}`
    );
    const products = data.products;

    const freeProduct = products.find((p: any) => p.id === vars.free.id);
    expect(products.length).to.equal(1);
    expect(freeProduct.id).to.equal(vars.free.id);
    expect(freeProduct.status).to.equal(CusProductStatus.Active);
    expect(freeProduct.canceled_at).to.equal(null);
  });
});
