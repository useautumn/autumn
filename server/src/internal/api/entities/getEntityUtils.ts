import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
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
  EntityResponse,
  ErrCode,
  FullCusProduct,
  Organization,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const getEntityResponse = async ({
  sb,
  entityIds,
  org,
  env,
  customerId,
}: {
  sb: SupabaseClient;
  entityIds: string[];
  org: Organization;
  env: AppEnv;
  customerId: string;
}) => {
  let customer = await CusService.getWithProducts({
    idOrInternalId: customerId,
    orgId: org.id,
    env,
    sb,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    withEntities: true,
  });

  let entities = customer.entities.filter((e: Entity) =>
    entityIds.includes(e.id)
  );

  let entityCusProducts = customer.customer_products.filter(
    (p: FullCusProduct) =>
      entities.some((e: Entity) => e.internal_id == p.internal_entity_id) ||
      nullish(p.internal_entity_id)
  );

  let stripeCli = createStripeCli({
    org,
    env,
  });

  let subs = (await getStripeSubs({
    stripeCli,
    subIds: entityCusProducts.flatMap(
      (p: FullCusProduct) => p.subscription_ids || []
    ),
  })) as Stripe.Subscription[];

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

    // let cusProducts = customer.customer_products.filter(
    //   (p: FullCusProduct) => p.internal_entity_id == entity.internal_id
    // );

    let entitySubs = subs.filter((s) =>
      entityCusProducts.some((p: FullCusProduct) =>
        p.subscription_ids?.includes(s.id)
      )
    );

    let products = await getCusProductsResponse({
      cusProducts: entityCusProducts,
      subs: entitySubs,
      org,
    });

    let features = await getCusFeaturesResponse({
      cusProducts: entityCusProducts,
      org,
      entities: customer.entities,
      entityId,
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
  };
};
