import { CusService } from "@/internal/customers/CusService.js";
import {
  getCusFeaturesResponse,
  getCusProductsResponse,
} from "@/internal/customers/cusUtils/cusResponseUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import {
  AppEnv,
  CusProductStatus,
  Entity,
  EntityExpand,
  EntityResponse,
  ErrCode,
  FullCusProduct,
  Organization,
  Subscription,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export const getEntityResponse = async ({
  sb,
  entityIds,
  org,
  env,
  customerId,
  expand,
  entityId,
  withAutumnId = false,
  apiVersion,
}: {
  sb: SupabaseClient;
  entityIds: string[];
  org: Organization;
  env: AppEnv;
  customerId: string;
  expand?: EntityExpand[];
  entityId?: string;
  withAutumnId?: boolean;
  apiVersion: number;
}) => {
  let customer = await CusService.getWithProducts({
    idOrInternalId: customerId,
    orgId: org.id,
    env,
    sb,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    withEntities: true,
    withSubs: true,
    expand,
    entityId,
  });

  if (!customer) {
    throw new RecaseError({
      message: `Customer ${customerId} not found`,
      code: ErrCode.CustomerNotFound,
      statusCode: 400,
    });
  }

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
    let entity = customer.entities.find((e: Entity) => e.id == entityId);
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

    let products = await getCusProductsResponse({
      cusProducts: entityCusProducts,
      entities: customer.entities,
      subs: entitySubs,
      org,
      apiVersion,
    });

    let features = await getCusFeaturesResponse({
      cusProducts: entityCusProducts,
      org,
      entities: customer.entities,
      entityId,
    });

    entityResponses.push({
      ...(withAutumnId ? { autumn_id: entity.internal_id } : {}),
      id: entity.id,
      name: entity.name,
      customer_id: customerId,
      created_at: entity.created_at,
      env,
      products,
      features,
    });
  }

  return {
    entities: entityResponses,
    customer,
    fullEntities: customer.entities,
    invoices: customer.invoices,
  };
};
