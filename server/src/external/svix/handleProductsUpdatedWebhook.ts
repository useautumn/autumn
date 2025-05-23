import {
  AppEnv,
  CusProductStatus,
  CusResponseSchema,
  Entitlement,
  FreeTrial,
  FullProduct,
  Organization,
  Price,
  Product,
  ProductResponseSchema,
} from "@autumn/shared";

import { sendSvixEvent } from "./svixUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerDetails } from "@/internal/api/customers/getCustomerDetails.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { z } from "zod";
import { getProductResponse } from "@/internal/products/productV2Utils.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

const ProductsUpdatedWebhookSchema = z.object({
  scenario: z.string(),
  product: ProductResponseSchema,
  customer: CusResponseSchema,
});

export const addProductsUpdatedWebhookTask = async ({
  internalCustomerId,
  org,
  env,
  customerId,
  product,
  prices,
  entitlements,
  freeTrial,
  scenario,
  logger,
}: {
  internalCustomerId: string;
  org: Organization;
  env: AppEnv;
  customerId: string | null;
  product: Product;
  prices: Price[];
  entitlements: Entitlement[];
  freeTrial: FreeTrial | null;
  scenario: string;
  logger: any;
}) => {
  try {
    await addTaskToQueue({
      jobName: JobName.SendProductsUpdatedWebhook,
      payload: constructProductsUpdatedData({
        internalCustomerId,
        org,
        env,
        customerId,
        product,
        prices,
        entitlements,
        freeTrial,
        scenario,
      }),
    });
  } catch (error) {
    logger.error("Failed to add products updated webhook task to queue", {
      error,
      org_slug: org.slug,
      org_id: org.id,
      env,
      internalCustomerId,
      productId: product.id,
    });
  }
};

export const constructProductsUpdatedData = ({
  internalCustomerId,
  org,
  env,
  customerId,
  product,
  prices,
  entitlements,
  freeTrial,
  scenario,
}: {
  internalCustomerId: string;
  org: Organization;
  env: AppEnv;
  customerId: string | null;
  product: Product;
  prices: Price[];
  entitlements: Entitlement[];
  freeTrial: FreeTrial | null;
  scenario: string;
}) => {
  return {
    internalCustomerId,
    org,
    env,
    customerId,
    product: {
      ...product,
      prices,
      entitlements,
      free_trial: freeTrial,
    },
    scenario,
  };
};

export const sendProductsUpdatedWebhook = async ({
  db,
  sb,
  logger,
  data,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
  logger: any;
  data: {
    internalCustomerId: string;
    org: Organization;
    env: AppEnv;
    customerId: string;
    product: FullProduct;
    scenario: string;
  };
}) => {
  const { org, env, product, scenario } = data;

  let customer = await CusService.getWithProducts({
    sb,
    idOrInternalId: data.customerId || data.internalCustomerId,
    orgId: data.org.id,
    env: data.env,
    inStatuses: [
      CusProductStatus.Active,
      CusProductStatus.Scheduled,
      CusProductStatus.Expired,
    ],
  });

  const features = await FeatureService.list({
    db,
    orgId: org.id,
    env,
  });

  const cusDetails = await getCustomerDetails({
    customer: customer,
    org,
    env,
    sb,
    features,
    logger,
    cusProducts: customer.customer_products,
    expand: [],
  });

  const productRes = getProductResponse({
    product,
    features,
  });

  const res = await sendSvixEvent({
    org,
    env,
    eventType: "customer.products.updated",
    data: {
      scenario,
      customer: cusDetails,
      updated_product: productRes,
    },
  });

  // console.log("Svix event sent", res);
  logger.info(
    `customer.product.updated webhook sent for ${org.slug}, customer ${customer.id}`,
    {
      message_id: res.id,
      customer_id: customer.id,
      product_id: product.id,
      scenario,
    },
  );
};
