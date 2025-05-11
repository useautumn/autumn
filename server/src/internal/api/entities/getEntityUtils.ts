import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
  getCusFeaturesResponse,
  getCusProductsResponse,
} from "@/internal/customers/cusUtils/cusResponseUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import RecaseError from "@/utils/errorUtils.js";
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
import Stripe from "stripe";

export const getEntityResponse = async ({
  sb,
  entityIds,
  org,
  env,
  customerId,
  expand,
  entityId,
}: {
  sb: SupabaseClient;
  entityIds: string[];
  org: Organization;
  env: AppEnv;
  customerId: string;
  expand?: EntityExpand[];
  entityId?: string;
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

  let entities = customer.entities.filter((e: Entity) =>
    entityIds.includes(e.id)
  );

  let entityCusProducts = customer.customer_products.filter(
    (p: FullCusProduct) =>
      entities.some((e: Entity) => e.internal_id == p.internal_entity_id)
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

    let cusProducts = customer.customer_products.filter(
      (p: FullCusProduct) => p.internal_entity_id == entity.internal_id
    );

    let entitySubs = subs.filter((s: Subscription) =>
      entityCusProducts.some((p: FullCusProduct) =>
        p.subscription_ids?.includes(s.stripe_id || "")
      )
    );

    let products = await getCusProductsResponse({
      cusProducts,
      subs: entitySubs,
      org,
    });

    let features = await getCusFeaturesResponse({
      cusProducts,
      org,
      entities: customer.entities,
    });

    entityResponses.push({
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
