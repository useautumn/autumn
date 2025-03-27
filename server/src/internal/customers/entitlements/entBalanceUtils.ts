import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { FullCustomerEntitlement } from "@shared/models/cusModels/cusEntModels/cusEntitlementModels.js";
import { StatusCodes } from "http-status-codes";

export const getEntityBalance = ({
  cusEnt,
  entityId,
}: {
  cusEnt: FullCustomerEntitlement;
  entityId: string;
}) => {
  let entityBalance = cusEnt.entities?.[entityId!]?.balance;

  if (nullish(entityBalance)) {
    throw new RecaseError({
      message: `Entity balance not found for entityId: ${entityId}`,
      code: "ENTITY_BALANCE_NOT_FOUND",
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  return entityBalance;
};

export const getSummedEntityBalances = ({
  cusEnt,
}: {
  cusEnt: FullCustomerEntitlement;
}) => {
  if (nullish(cusEnt.entities)) {
    return 0;
  }

  return Object.values(cusEnt.entities!).reduce(
    (acc, curr) => acc + curr.balance,
    0
  );
};
