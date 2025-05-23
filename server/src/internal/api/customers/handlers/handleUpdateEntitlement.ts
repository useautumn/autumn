import { handleRequestError } from "@/utils/errorUtils.js";

import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode, FullCustomerEntitlement, AppEnv } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { CusPriceService } from "@/internal/customers/prices/CusPriceService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  getCusEntBalance,
  getCusEntMasterBalance,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { performDeductionOnCusEnt } from "@/trigger/updateBalanceTask.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

const getCusOrgAndCusPrice = async ({
  req,
  sb,
  cusEnt,
  orgId,
}: {
  req: ExtendedRequest;
  sb: SupabaseClient;
  cusEnt: FullCustomerEntitlement;
  orgId: string;
}) => {
  const [cusPrice, customer, org] = await Promise.all([
    CusPriceService.getRelatedToCusEnt({
      sb: sb,
      cusEnt,
    }),
    CusService.getByInternalId({
      sb: sb,
      internalId: cusEnt.internal_customer_id,
    }),
    OrgService.getFromReq(req),
  ]);

  return { cusPrice, customer, org };
};

export const handleUpdateEntitlement = async (req: any, res: any) => {
  try {
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
    const cusEnt: any = await CustomerEntitlementService.getByIdStrict({
      sb: req.sb,
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
      allowNegativeBalance: cusEnt.usage_allowed,
      entityId: entity_id,
    });

    await CustomerEntitlementService.update({
      sb: req.sb,
      id: customer_entitlement_id,
      updates: {
        balance: newBalance,
        next_reset_at,
        entities: newEntities,
        adjustment: newAdjustment,
      },
    });

    const { cusPrice, customer, org } = await getCusOrgAndCusPrice({
      req,
      sb: req.sb,
      cusEnt,
      orgId: req.orgId,
    });

    if (!cusPrice) {
      res.status(200).json({ success: true });
      return;
    }

    await adjustAllowance({
      sb: req.sb,
      env: req.env,
      org: org,
      affectedFeature: cusEnt.entitlement.feature,
      cusEnt,
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
