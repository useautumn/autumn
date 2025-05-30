import { handleRequestError } from "@/utils/errorUtils.js";

import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  ErrCode,
  FullCustomerEntitlement,
  FullCusEntWithProduct,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getCusEntBalance } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { performDeductionOnCusEnt } from "@/trigger/updateBalanceTask.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

const getCusOrgAndCusPrice = async ({
  db,
  req,
  cusEnt,
}: {
  db: DrizzleCli;
  req: ExtendedRequest;
  cusEnt: FullCustomerEntitlement;
}) => {
  const [cusPrice, customer, org] = await Promise.all([
    CusPriceService.getRelatedToCusEnt({
      db,
      cusEnt,
    }),
    CusService.getByInternalId({
      db,
      internalId: cusEnt.internal_customer_id,
    }),
    OrgService.getFromReq(req),
  ]);

  return { cusPrice, customer, org };
};

export const handleUpdateEntitlement = async (req: any, res: any) => {
  try {
    const { db } = req;
    const { customer_entitlement_id } = req.params;
    const { balance, next_reset_at, entity_id } = req.body;

    if (isNaN(parseFloat(balance))) {
      throw new RecaseError({
        message: "Invalid balance",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (
      next_reset_at !== null &&
      (!Number.isInteger(next_reset_at) || next_reset_at < 0)
    ) {
      throw new RecaseError({
        message: "Next reset at must be a valid unix timestamp or null",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // Check if org owns the entitlement
    const cusEnt = await CusEntService.getStrict({
      db,
      id: customer_entitlement_id,
      orgId: req.orgId,
      env: req.env,
      withCusProduct: true,
    });

    if (balance < 0 && !cusEnt.usage_allowed) {
      throw new RecaseError({
        message: "Entitlement does not allow usage",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (cusEnt.unlimited) {
      throw new RecaseError({
        message: "Entitlement is unlimited",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // let { balance: masterBalance } = getCusEntMasterBalance({
    //   cusEnt,
    //   entities: cusEnt.customer_product.entities,
    // });
    let { balance: masterBalance } = getCusEntBalance({
      cusEnt,
      entityId: entity_id,
    });

    const deducted = new Decimal(masterBalance!).minus(balance).toNumber();

    let originalBalance = structuredClone(masterBalance);

    let { newBalance, newEntities, newAdjustment } = performDeductionOnCusEnt({
      cusEnt,
      toDeduct: deducted,
      addAdjustment: true,
      allowNegativeBalance: cusEnt.usage_allowed || false,
      entityId: entity_id,
    });

    await CusEntService.update({
      db,
      id: customer_entitlement_id,
      updates: {
        balance: newBalance,
        next_reset_at,
        entities: newEntities,
        adjustment: newAdjustment,
      },
    });

    const { cusPrice, customer, org } = await getCusOrgAndCusPrice({
      db,
      req,
      cusEnt,
    });

    if (!cusPrice || !customer) {
      res.status(200).json({ success: true });
      return;
    }

    await adjustAllowance({
      db,

      env: req.env,
      org: org,
      affectedFeature: cusEnt.entitlement.feature,
      cusEnt: cusEnt as FullCusEntWithProduct,
      cusPrices: [cusPrice],
      customer: customer,
      originalBalance: originalBalance!,
      newBalance: balance,
      deduction: deducted,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    handleRequestError({
      req,
      error,
      res,
      action: "update customer entitlement",
    });
  }
};
