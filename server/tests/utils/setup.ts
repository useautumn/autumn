import { createSupabaseClient } from "@/external/supabaseUtils.js";
import {
  AppEnv,
  CreateCoupon,
  Feature,
  FeatureType,
  FullProduct,
  Price,
  PriceType,
} from "@autumn/shared";
import axios from "axios";

import { OrgService } from "@/internal/orgs/OrgService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  deleteAllStripeTestClocks,
  deleteStripeProduct,
} from "./stripeUtils.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import Stripe from "stripe";

export const getAxiosInstance = (
  apiKey: string = process.env.UNIT_TEST_AUTUMN_SECRET_KEY!
) => {
  return axios.create({
    baseURL: "http://localhost:8080",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
};

export const getPublicAxiosInstance = ({
  withBearer,
  pkey = process.env.UNIT_TEST_AUTUMN_PUBLIC_KEY!,
}: {
  withBearer: boolean;
  pkey?: string;
}) => {
  let headers = withBearer
    ? {
        Authorization: `Bearer ${pkey}`,
      }
    : {
        "x-publishable-key": pkey,
      };
  return axios.create({
    baseURL: "http://localhost:8080",
    headers: headers,
  });
};

export const clearOrg = async ({
  orgSlug,
  env,
}: {
  orgSlug: string;
  env?: AppEnv;
}) => {
  if (env !== AppEnv.Sandbox) {
    console.error("Cannot clear non-sandbox orgs");
    process.exit(1);
  }

  const sb = createSupabaseClient();
  const org = await OrgService.getBySlug({ sb, slug: orgSlug });

  if (!org) {
    throw new Error(`Org ${orgSlug} not found`);
  }

  if (org.slug !== "unit-test-org") {
    console.error("Cannot clear non-unit-test-orgs");
    process.exit(1);
  }

  const orgId = org.id;

  // 1. Delete all customers
  const { data: customers, error: customerError } = await sb
    .from("customers")
    .delete()
    .eq("org_id", orgId)
    .eq("env", env)
    .select("*");

  if (customerError) {
    console.error("Error deleting customers:", customerError);
  }

  console.log("   ✅ Deleted customers");

  const stripeCli = createStripeCli({ org, env: env! });
  const stripeCustomers = await stripeCli.customers.list({
    limit: 100,
  });
  const deleteCustomer = async (customer: Stripe.Customer) => {
    try {
      await stripeCli.customers.del(customer.id);
    } catch (error) {
      console.error("Error deleting stripe customer", customer.id);
    }
  };

  const cusBatchSize = 5;
  for (let i = 0; i < stripeCustomers.data.length; i += cusBatchSize) {
    const batch = stripeCustomers.data.slice(i, i + cusBatchSize);
    const batchDeleteCustomers = [];
    for (const customer of batch) {
      batchDeleteCustomers.push(deleteCustomer(customer));
    }
    await Promise.all(batchDeleteCustomers);
    console.log(
      `   ✅ Deleted ${i + batch.length}/${
        stripeCustomers.data.length
      } Stripe customers`
    );
  }

  console.log("   ✅ Deleted Stripe customers");

  // 2. Delete all products
  const { data: products, error: productError } = await sb
    .from("products")
    .delete()
    .eq("org_id", orgId)
    .eq("env", env)
    .select("*, prices(*)");
  if (productError) {
    console.error("Error deleting products:", productError);
  }

  console.log("   ✅ Deleted products");

  const stripeProducts = await stripeCli.products.list({
    limit: 100,
    active: true,
  });

  const batchSize = 5;

  const removeStripeProduct = async (product: Stripe.Product) => {
    try {
      await stripeCli.products.del(product.id);
    } catch (error) {
      await stripeCli.products.update(product.id, {
        active: false,
      });
    }
  };

  for (let i = 0; i < stripeProducts.data.length; i += batchSize) {
    const batch = stripeProducts.data.slice(i, i + batchSize);
    const batchDeleteProducts = [];
    for (const product of batch) {
      batchDeleteProducts.push(removeStripeProduct(product));
    }
    await Promise.all(batchDeleteProducts);
    console.log(
      `   ✅ Deleted ${i + batch.length}/${
        stripeProducts.data.length
      } Stripe products`
    );
  }

  console.log("   ✅ Deleted Stripe products");

  await deleteAllStripeTestClocks({ stripeCli });
  console.log("   ✅ Deleted Stripe test clocks");

  // Batch delete coupons

  const batchDeleteCoupons = [];
  const { data: coupons, error: couponError } = await sb
    .from("coupons")
    .delete()
    .eq("org_id", orgId)
    .eq("env", env)
    .select();

  const stripeCoupons = await stripeCli.coupons.list({
    limit: 100,
  });
  for (const coupon of stripeCoupons.data) {
    batchDeleteCoupons.push(stripeCli.coupons.del(coupon.id));
  }

  await Promise.all(batchDeleteCoupons);
  console.log("   ✅ Deleted Stripe coupons");

  const { error: featureError } = await sb
    .from("features")
    .delete()
    .eq("org_id", orgId)
    .eq("env", env);

  if (featureError) {
    console.error("Error deleting features:", featureError);
  }

  console.log(`✅ Cleared org ${orgSlug} (${env})`);
  return org;
};

export const setupOrg = async ({
  orgId,
  env,
  features,
  products,
  coupons,
}: {
  orgId: string;
  env: AppEnv;
  features: Record<string, Feature & { eventName: string }>;
  products: Record<string, FullProduct | any>;
  coupons: Record<string, any>;
}) => {
  const axiosInstance = getAxiosInstance();
  const sb = createSupabaseClient();

  let insertFeatures = [];
  for (const feature of Object.values(features)) {
    insertFeatures.push(axiosInstance.post("/v1/features", feature));
  }
  await Promise.all(insertFeatures);

  const { data: newFeatures } = await sb
    .from("features")
    .select("*")
    .eq("org_id", orgId)
    .eq("env", env);

  for (const feature of newFeatures!) {
    features[feature.id].internal_id = feature.internal_id;

    if (feature.type === FeatureType.Metered) {
      features[feature.id].eventName = feature.config?.filters[0].value[0];
    }
  }

  console.log("✅ Inserted features");

  // 2. Create products
  let insertProducts = [];
  for (const product of Object.values(products)) {
    const insertProduct = async () => {
      // console.log("Inserting:", product.id);
      try {
        await axiosInstance.post("/v1/products", {
          product: {
            id: product.id,
            name: product.name,
            group: product.group,
            is_add_on: product.is_add_on,
            is_default: product.is_default,
          },
        });
      } catch (error) {
        console.error("Error inserting product:", product.id);
        throw error;
      }

      const prices = product.prices.map((p: any) => ({
        ...p,
        config: {
          ...p.config,
          internal_feature_id: newFeatures!.find(
            (f) => f.id === (p.config as any)?.feature_id
          )?.internal_id,
        },
      }));

      const entitlements = Object.values(product.entitlements).map(
        (ent: any) => ({
          ...ent,
          internal_feature_id: newFeatures!.find((f) => f.id === ent.feature_id)
            ?.internal_id,
        })
      );

      await axiosInstance.post(`/v1/products/${product.id}`, {
        prices: prices,
        entitlements: entitlements,
        free_trial: product.free_trial,
      });
    };

    insertProducts.push(insertProduct());
  }

  await Promise.all(insertProducts);

  console.log("✅ Inserted products");

  // Fetch all products
  const allProducts = await AutumnCli.getProducts();
  const productIds = allProducts.map((p: any) => p.id);

  // Insert coupons
  let insertCoupons = [];
  for (const coupon of Object.values(coupons)) {
    const createCoupon = async () => {
      let priceIds = [];

      if (coupon.only_usage_prices) {
        let filteredProducts = allProducts.filter((product: FullProduct) => {
          if (coupon.product_ids) {
            return coupon.product_ids.includes(product.id);
          } else return true;
        });

        priceIds = filteredProducts.flatMap((product: FullProduct) =>
          product.prices
            .filter((price: Price) => price.config!.type === PriceType.Usage)
            .map((price) => {
              return price.id;
            })
        );
      } else if (coupon.product_ids) {
        priceIds = allProducts
          .filter((product: FullProduct) =>
            coupon.product_ids.includes(product.id)
          )
          .flatMap((product: FullProduct) =>
            product.prices.map((price) => price.id)
          );
      }

      const newCoupon: CreateCoupon & { id: string } = {
        id: coupon.id,
        name: coupon.name,
        price_ids: priceIds,
        promo_codes: [
          {
            code: coupon.id,
          },
        ],
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        duration_type: coupon.duration_type,
        duration_value: coupon.duration_value,
        should_rollover: coupon.should_rollover,
        apply_to_all: coupon.apply_to_all,
      };

      let couponRes = await AutumnCli.createCoupon(newCoupon);
      return {
        id: coupon.id,
        couponRes,
      };
    };
    insertCoupons.push(createCoupon());
  }
  await Promise.all(insertCoupons);
  console.log("✅ Inserted coupons");

  // Initialize stripe products
  // How to check if mocha is in parallel mode?
  if (process.env.MOCHA_PARALLEL) {
    console.log("MOCHA RUNNING IN PARALLEL");
    await AutumnCli.initStripeProducts();
    console.log("✅ Initialized stripe products / prices");
  } else {
    console.log("MOCHA RUNNING IN SERIAL");
  }
};
