import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { notNullish } from "@/utils/genUtils.js";
import { Entitlement, Entity, Feature, FullCustomerEntitlement } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export const getLinkedCusEnt = ({
  linkedFeature,
  cusEnts,
}: {
  linkedFeature: any;
  cusEnts: any;
}) => {
  // Get linked cus ent...
  let linkedCusEnt = cusEnts.find(
    (e: any) => e.entitlement.feature.id === linkedFeature.id
  );

  if (!linkedCusEnt) {
    return null;
  }

  return linkedCusEnt;
};

export const entityFeatureIdExists = ({
  cusEnt,
}: {
  cusEnt: FullCustomerEntitlement;
}) => {
  let ent = cusEnt.entitlement;
  return notNullish(ent.entity_feature_id);
};

export const entityMatchesFeature = ({feature, entity}: {feature: Feature, entity: Entity}) => {
  return feature.id == entity.feature_id;
}

export const entitlementLinkedToEntity = ({
  entitlement,
  entity,
}: {
  entitlement: Entitlement;
  entity: Entity;
}) => {
  return entitlement.entity_feature_id == entity.feature_id;
}

export const isLinkedToEntity = ({
  cusEnt,
  entity,
}: {
  cusEnt: FullCustomerEntitlement;
  entity: Entity;
}) => {
  return cusEnt.entitlement.entity_feature_id == entity.feature_id;
}

export const removeEntityFromCusEnt = async ({
  sb,
  cusEnt,
  entity,
  logger,
}: {
  sb: SupabaseClient;
  cusEnt: FullCustomerEntitlement;
  entity: Entity;
  logger: any;
}) => {
  // isLinked
  let isLinked = isLinkedToEntity({
    cusEnt,
    entity,
  });

  
  if (!isLinked) {
    return;
  }
  
  let entitlement = cusEnt.entitlement;
  console.log(`Linked cus ent: ${entitlement.feature.id}, isLinked: ${isLinked}`);

  // Delete cus ent ids
  let newEntities = structuredClone(cusEnt.entities!);
  for (const entityId in newEntities) {
    if (entityId in newEntities) {
      delete newEntities[entityId];
    }
  }

  await CustomerEntitlementService.update({
    sb,
    id: cusEnt.id,
    updates: {
      entities: newEntities,
    },
  });

  logger.info(
    `Feature: ${entitlement.feature.id}, customer: ${cusEnt.customer_id}, deleted entities from cus ent`
  );
}