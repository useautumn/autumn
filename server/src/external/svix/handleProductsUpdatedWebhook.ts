import {
  AppEnv,
  AuthType,
  CusProductStatus,
  Entitlement,
  FreeTrial,
  FullProduct,
  Organization,
  Price,
  Product,
} from "@autumn/shared";

import { sendSvixEvent } from "./svixUtils.js";
import { CusService } from "@/internal/customers/CusService.js";

import { getCustomerDetails } from "@/internal/api/customers/getCustomerDetails.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

import { getProductResponse } from "@/internal/products/productV2Utils.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

interface ActionDetails {
  reqId: string;
  reqBody: any;
  method: string;
  path: string;
  timestamp: number;
  authType: AuthType;
}

export const addProductsUpdatedWebhookTask = async ({
  req,
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
  req?: ExtendedRequest;
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
    let fullProduct = {
      ...product,
      prices,
      entitlements,
      free_trial: freeTrial,
    };

    let actionDetails: ActionDetails = req
      ? {
          reqId: req.id,
          reqBody: req.body,
          method: req.method,
          path: req.originalUrl,
          timestamp: Date.now(),
          authType: req.authType,
        }
      : undefined;

    await addTaskToQueue({
      jobName: JobName.SendProductsUpdatedWebhook,
      payload: {
        internalCustomerId,
        org,
        env,
        customerId,
        product: fullProduct,
        scenario,
      },
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

export const sendProductsUpdatedWebhook = async ({
  db,
  logger,
  data,
}: {
  db: DrizzleCli;
  logger: any;
  data: {
    actionDetails: ActionDetails;
    internalCustomerId: string;
    org: Organization;
    env: AppEnv;
    customerId: string;
    product: FullProduct;
    scenario: string;
  };
}) => {
  const { org, env, product, scenario } = data;

  let customer = await CusService.getFull({
    db,
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
    db,
    customer: customer,
    org,
    env,
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
