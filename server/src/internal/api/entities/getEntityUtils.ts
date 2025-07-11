import type { DrizzleCli } from "@/db/initDrizzle.js";
import { ACTIVE_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
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
} from "@autumn/shared";

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
}) => {
  let customer = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env,
    inStatuses: ACTIVE_STATUSES,
    withEntities: true,
    withSubs: true,
    expand,
    entityId,
  });

  let entities = customer.entities.filter((e: Entity) =>
    entityIds.includes(e.id),
  );

  let entityCusProducts = customer.customer_products.filter(
    (p: FullCusProduct) =>
      entities.some((e: Entity) => e.internal_id == p.internal_entity_id) ||
      nullish(p.internal_entity_id),
  );

  let subs = customer.subscriptions || [];

  const entityResponses: EntityResponse[] = [];
  for (const entityId of entityIds) {
    let entity = customer.entities.find(
      (e: Entity) => e.id == entityId || e.internal_id == entityId,
    );
    if (!entity) {
      throw new RecaseError({
        message: `Entity ${entityId} not found for customer ${customerId}`,
        code: ErrCode.EntityNotFound,
        statusCode: 400,
      });
    }

    let entitySubs = subs.filter((s: Subscription) =>
      entityCusProducts.some((p: FullCusProduct) =>
        p.subscription_ids?.includes(s.stripe_id || ""),
      ),
    );

    let { main, addOns } = await processFullCusProducts({
      fullCusProducts: entityCusProducts,
      entities: customer.entities,
      subs: entitySubs,
      org,
      apiVersion,
      features,
    });
    let products: CusProductResponse[] = [...main, ...addOns];

    let cusFeatures = await getCusFeaturesResponse({
      cusProducts: entityCusProducts,
      org,
      entity,
      apiVersion,
    });

    entityResponses.push({
      ...(withAutumnId ? { autumn_id: entity.internal_id } : {}),
      id: entity.id,
      name: entity.name,
      created_at: entity.created_at,
      // feature_id: entity.feature_id,
      customer_id: customerId,
      env,
      products,
      features: cusFeatures,
    });
  }

  return {
    entities: entityResponses,
    customer,
    fullEntities: customer.entities,
    invoices: customer.invoices,
  };
};
