import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getCusWithCache } from "@/internal/customers/cusCache/getCusWithCache.js";
import {
  ACTIVE_STATUSES,
  RELEVANT_STATUSES,
} from "@/internal/customers/cusProducts/CusProductService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCusFeaturesResponse } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/getCusFeaturesResponse.js";
import { processFullCusProducts } from "@/internal/customers/cusUtils/cusProductResponseUtils/processFullCusProducts.js";

import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import {
  type AppEnv,
  Feature,
  CusProductStatus,
  type Entity,
  EntityExpand,
  type EntityResponse,
  ErrCode,
  type FullCusProduct,
  type Organization,
  type Subscription,
  CusProductResponse,
  notNullish,
  FullCustomer,
  APIVersion,
} from "@autumn/shared";

export const getSingleEntityResponse = async ({
  entityId,
  org,
  env,
  fullCus,
  features,
  withAutumnId = false,
}: {
  entityId: string;
  org: Organization;
  env: AppEnv;
  fullCus: FullCustomer;
  features: Feature[];
  withAutumnId?: boolean;
}) => {
  let entity = fullCus.entities.find(
    (e: Entity) => e.id == entityId || e.internal_id == entityId
  );

  const apiVersion = APIVersion.v1_2;

  if (!entity) {
    throw new RecaseError({
      message: `Entity ${entityId} not found for customer ${fullCus.id}`,
      code: ErrCode.EntityNotFound,
      statusCode: 400,
    });
  }

  const entityCusProducts = fullCus.customer_products.filter(
    (p: FullCusProduct) => {
      if (org.config.entity_product) {
        return (
          notNullish(p.internal_entity_id) &&
          p.internal_entity_id == entity.internal_id
        );
      }

      return (
        p.internal_entity_id == entity.internal_id ||
        nullish(p.internal_entity_id)
      );
    }
  );

  let entitySubs = (fullCus.subscriptions || []).filter((s: Subscription) =>
    entityCusProducts.some((p: FullCusProduct) =>
      p.subscription_ids?.includes(s.stripe_id || "")
    )
  );

  let { main, addOns } = await processFullCusProducts({
    fullCusProducts: entityCusProducts,
    entities: fullCus.entities,
    subs: entitySubs,
    org,
    apiVersion: APIVersion.v1_2,
    features,
  });

  let products: CusProductResponse[] = [...main, ...addOns];

  let cusFeatures = await getCusFeaturesResponse({
    cusProducts: entityCusProducts,
    org,
    entity,
    apiVersion,
  });

  return {
    ...(withAutumnId ? { autumn_id: entity.internal_id } : {}),
    id: entity.id,
    name: entity.name,
    created_at: entity.created_at,
    // feature_id: entity.feature_id,
    customer_id: fullCus.id || fullCus.internal_id,
    env,
    products,
    features: cusFeatures,
  };
};

export const getEntityResponse = async ({
  db,
  entityIds,
  org,
  env,
  customerId,
  expand,
  entityId,
  withAutumnId = false,
  apiVersion,
  features,
  logger,
  skipCache = false,
}: {
  db: DrizzleCli;
  entityIds: string[];
  org: Organization;
  env: AppEnv;
  customerId: string;
  expand?: EntityExpand[];
  entityId?: string;
  withAutumnId?: boolean;
  apiVersion: number;
  features: Feature[];
  logger: any;
  skipCache?: boolean;
}) => {
  let customer = await getCusWithCache({
    db,
    idOrInternalId: customerId,
    org,
    env,
    expand,
    entityId,
    logger,
    skipCache,
  });

  if (!customer) {
    throw new RecaseError({
      message: `Customer ${customerId} not found`,
      code: ErrCode.CustomerNotFound,
      statusCode: 400,
    });
  }

  const entityResponses: EntityResponse[] = [];
  for (const entityId of entityIds) {
    let entityResponse = await getSingleEntityResponse({
      entityId,
      org,
      env,
      fullCus: customer,
      features,
      withAutumnId,
    });

    entityResponses.push(entityResponse);
  }

  return {
    entities: entityResponses,
    customer,
    fullEntities: customer.entities,
    invoices: customer.invoices,
  };
};
