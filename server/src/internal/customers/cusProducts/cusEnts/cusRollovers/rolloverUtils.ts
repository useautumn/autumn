import {
  FullCustomerEntitlement,
  RolloverConfig,
  RolloverModel,
  RolloverDuration,
} from "@autumn/shared";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";
import { addMonths } from "date-fns";

export const getRolloverUpdates = ({
  cusEnt,
  nextResetAt,
}: {
  cusEnt: FullCustomerEntitlement;
  nextResetAt: number;
}) => {
  let update: {
    toDelete: string[];
    toInsert: RolloverModel[];
    toUpdate: RolloverModel[];
  } = {
    toDelete: [],
    toInsert: [],
    toUpdate: [],
  };
  let ent = cusEnt.entitlement;
  let shouldRollover =
    cusEnt.balance && cusEnt.balance > 0 && notNullish(ent.rollover);

  if (!shouldRollover) return update;

  let nextExpiry = calculateNextExpiry(nextResetAt, ent.rollover!);

  let newEntitlement: RolloverModel = {
    id: generateId("roll"),
    entities: {},
    cus_ent_id: cusEnt.id,
    balance: 0,
    expires_at: nextExpiry,
  };

  if (notNullish(ent.entity_feature_id)) {
    for (const entityId in cusEnt.entities) {
      let entRollover = cusEnt.entities[entityId].balance;
      if (entRollover > 0) {
        newEntitlement.entities[entityId] = {
          id: entityId,
          balance: entRollover,
          adjustment: 0,
        };
      }
    }
    update.toInsert.push(newEntitlement);
  } else {
    let balance = cusEnt.balance!;
    if (balance > 0) {
      newEntitlement.balance = balance;
      update.toInsert.push(newEntitlement);
    }
  }

  return update;
};

export const calculateNextExpiry = (
  nextResetAt: number,
  config: RolloverConfig
) => {
  if (nullish(config)) {
    return null;
  }

  if (config.duration == RolloverDuration.Forever) return null;

  return addMonths(nextResetAt, config.length).getTime();
};

// if (nullish(nextExpiry) || !nextExpiry) {
//   return update;
// }

// let entitlement = cusEnt.entitlement.allowance ?? 0;

// if (entitlement < 0) {
//   return update;
// }

// let rollover = cusEnt.balance || 0;
// console.log(
//   `🔥 Unused balance (rollover): ${rollover} | Entitlement: ${entitlement}`
// );
