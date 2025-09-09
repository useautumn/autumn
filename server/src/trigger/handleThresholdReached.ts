import { DrizzleCli } from "@/db/initDrizzle.js";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
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
        eventType: WebhookEventType.CustomerFeaturesThresholdReached,
        data: {
          threshold_type: "limit_reached",
          customer: cusDetails,
          feature: toAPIFeature({ feature }),
        },
      });

      logger.info("Sent Svix event for threshold reached");
    }
  } catch (error: any) {
    logger.error("Failed to handle threshold reached", {
      error,
      message: error?.message,
    });
  }
};
