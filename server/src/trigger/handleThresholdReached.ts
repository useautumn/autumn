import { DrizzleCli } from "@/db/initDrizzle.js";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { getSingleEntityResponse } from "@/internal/api/entities/getEntityUtils.js";
import { getV2CheckResponse } from "@/internal/api/entitled/checkUtils/getV2CheckResponse.js";
import { getCustomerDetails } from "@/internal/customers/cusUtils/getCustomerDetails.js";
import { toAPIFeature } from "@/internal/features/utils/mapFeatureUtils.js";
import {
  FullCusEntWithFullCusProduct,
  Feature,
  FullCustomer,
  Organization,
  AppEnv,
  FullCusProduct,
  APIVersion,
  WebhookEventType,
} from "@autumn/shared";

export const mergeNewCusEntsIntoCusProducts = ({
  cusProducts,
  newCusEnts,
}: {
  cusProducts: FullCusProduct[];
  newCusEnts: FullCusEntWithFullCusProduct[];
}) => {
  for (const cusProduct of cusProducts) {
    for (let i = 0; i < cusProduct.customer_entitlements.length; i++) {
      let correspondingCusEnt = newCusEnts.find(
        (cusEnt) => cusEnt.id == cusProduct.customer_entitlements[i].id
      );

      if (correspondingCusEnt) {
        const { customer_product, ...rest } = correspondingCusEnt;
        cusProduct.customer_entitlements[i] = rest;
      }
    }
  }

  return cusProducts;
};

export const sendSvixThresholdReachedEvent = async ({
  db,
  org,
  env,
  features,
  logger,
  feature,
  fullCus,
  thresholdType,
}: {
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  features: Feature[];
  logger: any;
  feature: Feature;
  fullCus: FullCustomer;
  thresholdType: "limit_reached" | "allowance_used";
}) => {
  const cusDetails = await getCustomerDetails({
    db,
    customer: fullCus,
    org,
    env,
    features,
    logger,
    cusProducts: fullCus.customer_products,
    expand: [],
  });

  if (fullCus.entity) {
    const entities = await EntityService.list({
      db,
      internalCustomerId: fullCus.internal_id,
    });
    fullCus.entities = entities;
    await getSingleEntityResponse({
      org,
      env,
      features,
      fullCus,
      entityId: fullCus.entity.id,
    });
  }

  await sendSvixEvent({
    org: org,
    env: env,
    eventType: WebhookEventType.CustomerThresholdReached,
    data: {
      threshold_type: thresholdType,
      customer: cusDetails,
      feature: toAPIFeature({ feature }),
    },
  });

  logger.info(`Sent Svix event for threshold reached (type: ${thresholdType})`);
  return;
};

export const handleAllowanceUsed = async ({
  db,
  org,
  env,
  features,
  logger,
  cusEnts,
  newCusEnts,
  feature,
  fullCus,
}: {
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  cusEnts: FullCusEntWithFullCusProduct[];
  newCusEnts: FullCusEntWithFullCusProduct[];
  feature: Feature;
  fullCus: FullCustomer;
  features: Feature[];
  logger: any;
}) => {
  // Allowance used...
  // Make sure overage allowed is false
  for (const cusEnt of cusEnts) {
    cusEnt.usage_allowed = false;
  }

  for (const cusEnt of newCusEnts) {
    cusEnt.usage_allowed = false;
  }

  const prevCheckResponse = await getV2CheckResponse({
    fullCus,
    cusEnts,
    creditSystems: [],
    feature,
    org,
    cusProducts: fullCus.customer_products,
    apiVersion: APIVersion.v1_2,
  });

  const v2CheckResponse = await getV2CheckResponse({
    fullCus,
    cusEnts: newCusEnts,
    creditSystems: [],
    feature,
    org,
    cusProducts: fullCus.customer_products,
    apiVersion: APIVersion.v1_2,
  });

  // console.log(`Handling allowance used for feature: ${feature.id}`);
  // console.log(
  //   `Prev: allowed (${prevCheckResponse.allowed}), balance (${prevCheckResponse.balance})`
  // );
  // console.log(
  //   `Current: allowed (${v2CheckResponse.allowed}), balance (${v2CheckResponse.balance})`
  // );

  if (prevCheckResponse.allowed === true && v2CheckResponse.allowed === false) {
    await sendSvixThresholdReachedEvent({
      db,
      org,
      env,
      features,
      logger,
      feature,
      fullCus,
      thresholdType: "allowance_used",
    });
  }
};

export const handleThresholdReached = async ({
  db,
  feature,
  cusEnts,
  newCusEnts,
  fullCus,
  org,
  env,
  features,
  logger,
}: {
  db: DrizzleCli;
  feature: Feature;
  cusEnts: FullCusEntWithFullCusProduct[];
  newCusEnts: FullCusEntWithFullCusProduct[];

  fullCus: FullCustomer;
  org: Organization;
  env: AppEnv;
  features: Feature[];
  logger: any;
}) => {
  try {
    const newCusProducts = mergeNewCusEntsIntoCusProducts({
      cusProducts: fullCus.customer_products,
      newCusEnts: newCusEnts,
    });

    fullCus.customer_products = newCusProducts;

    const prevCheckResponse = await getV2CheckResponse({
      fullCus,
      cusEnts: cusEnts,
      creditSystems: [],
      feature,
      org,
      cusProducts: fullCus.customer_products,
      apiVersion: APIVersion.v1_2,
    });

    const v2CheckResponse = await getV2CheckResponse({
      fullCus,
      cusEnts: newCusEnts,
      creditSystems: [],
      feature,
      org,
      cusProducts: newCusProducts,
      apiVersion: APIVersion.v1_2,
    });

    if (
      prevCheckResponse.allowed === true &&
      v2CheckResponse.allowed === false
    ) {
      const cusDetails = await getCustomerDetails({
        db,
        customer: fullCus,
        org,
        env,
        features,
        logger,
        cusProducts: newCusProducts,
        expand: [],
      });

      if (fullCus.entity) {
        const entities = await EntityService.list({
          db,
          internalCustomerId: fullCus.internal_id,
        });
        fullCus.entities = entities;
        await getSingleEntityResponse({
          org,
          env,
          features,
          fullCus,
          entityId: fullCus.entity.id,
        });
      }

      await sendSvixEvent({
        org: org,
        env: env,
        eventType: WebhookEventType.CustomerThresholdReached,
        data: {
          threshold_type: "limit_reached",
          customer: cusDetails,
          feature: toAPIFeature({ feature }),
        },
      });

      logger.info(
        "Sent Svix event for threshold reached (type: limit_reached)"
      );
      return;
    }
    await handleAllowanceUsed({
      db,
      org,
      env,
      features,
      logger,
      cusEnts,
      newCusEnts,
      feature,
      fullCus,
    });
    return;
  } catch (error: any) {
    logger.error("Failed to handle threshold reached", {
      error,
      message: error?.message,
    });
  }
};
