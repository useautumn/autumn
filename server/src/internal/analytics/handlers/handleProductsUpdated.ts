import {
  ActionType,
  AppEnv,
  AuthType,
  CusProductStatus,
  FullCusProduct,
  FullProduct,
  Organization,
} from "@autumn/shared";

import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import { CusService } from "@/internal/customers/CusService.js";

import { getCustomerDetails } from "@/internal/customers/cusUtils/getCustomerDetails.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { ActionService } from "@/internal/analytics/ActionService.js";
import { constructAction } from "@/internal/analytics/actionUtils.js";
import { parseReqForAction } from "@/internal/analytics/actionUtils.js";

interface ActionDetails {
  request_id: string;
  method: string;
  path: string;
  timestamp: string;
  auth_type: AuthType;
  properties: any;
}

export const addProductsUpdatedWebhookTask = async ({
  req,
  org,
  env,
  customerId,
  internalCustomerId,
  cusProduct,
  scheduledCusProduct,
  deletedCusProduct,
  scenario,
  logger,
}: {
  req?: ExtendedRequest;
  org: Organization;
  env: AppEnv;
  customerId: string | null;
  internalCustomerId: string;
  cusProduct: FullCusProduct;
  scheduledCusProduct?: FullCusProduct;
  deletedCusProduct?: FullCusProduct;
  scenario: string;
  logger: any;
}) => {
  // Build action

  try {
    await addTaskToQueue({
      jobName: JobName.HandleProductsUpdated,
      payload: {
        req: req ? parseReqForAction(req) : undefined,
        internalCustomerId,
        org,
        env,
        customerId,
        cusProduct,
        scheduledCusProduct,
        deletedCusProduct,
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
      productId: cusProduct.product.id,
      cusProductId: cusProduct.id,
      // productId: product.id,
    });
  }
};

export const handleProductsUpdated = async ({
  db,
  logger,
  data,
}: {
  db: DrizzleCli;
  logger: any;
  data: {
    req: Partial<ExtendedRequest>;
    actionDetails: ActionDetails;
    internalCustomerId: string;
    org: Organization;
    env: AppEnv;
    customerId: string;
    product: FullProduct;
    scenario: string;
    cusProduct: FullCusProduct;
    scheduledCusProduct?: FullCusProduct;
    deletedCusProduct?: FullCusProduct;
  };
}) => {
  const {
    req,
    org,
    env,
    scenario,
    cusProduct,
    scheduledCusProduct,
    deletedCusProduct,
  } = data;

  if (!req) {
    logger.warn("products.updated, no req object found, skipping", {
      ...data,
      org: {
        id: org.id,
        slug: org.slug,
      },
    });
    return;
  }

  // Product:
  let product = cusProduct.product;
  let prices = cusProduct.customer_prices.map((cp) => cp.price);
  let entitlements = cusProduct.customer_entitlements.map(
    (ce) => ce.entitlement,
  );
  let freeTrial = cusProduct.free_trial;

  let fullProduct: FullProduct = {
    ...product,
    prices,
    entitlements,
    free_trial: freeTrial || null,
  };

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
    entityId: cusProduct.internal_entity_id || undefined,
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

  const productRes = await getProductResponse({
    product: fullProduct,
    features,
  });

  // 1. Log action to DB

  try {
    let action = constructAction({
      org,
      env,
      customer,
      entity: customer.entity,
      type: ActionType.CustomerProductsUpdated,
      req,
      properties: {
        product_id: product.id,
        customer_product_id: cusProduct.id,
        scenario,

        deleted_product_id: deletedCusProduct?.product.id,
        scheduled_product_id: scheduledCusProduct?.product.id,

        body: req.body,
      },
    });

    await ActionService.insert(db, action);
  } catch (error: any) {
    logger.error("Failed to log action to DB", {
      message: error.message,
      error: error,
    });
  }

  // 2. Send Svix event
  await sendSvixEvent({
    org,
    env,
    eventType: "customer.products.updated",
    data: {
      scenario,
      customer: cusDetails,
      updated_product: productRes,
    },
  });
};
