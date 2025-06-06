import { FullCustomerEntitlement, Replaceable } from "@autumn/shared";

export const replaceEntityInCusEnt = ({
  cusEnt,
  entityId,
  replaceable,
}: {
  cusEnt: FullCustomerEntitlement;
  entityId: string;
  replaceable: Replaceable;
}) => {
  let newEntities = structuredClone(cusEnt.entities) || {};
  newEntities[replaceable.id] = newEntities[entityId];

  delete newEntities[entityId];

  return { newEntities };
};

export const deleteEntityFromCusEnt = ({
  cusEnt,
  entityId,
}: {
  cusEnt: FullCustomerEntitlement;
  entityId: string;
}) => {
  let newEntities = structuredClone(cusEnt.entities) || {};
  delete newEntities[entityId];

  return { newEntities };
};
