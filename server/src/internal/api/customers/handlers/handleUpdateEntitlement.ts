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
const getCusOrgAndCusPrice = async ({
  sb,
  cusEnt,
  orgId,
  env,
}: {
  sb: SupabaseClient;
  cusEnt: FullCustomerEntitlement;
  orgId: string;
  env: AppEnv;
}) => {
  const [cusPrice, customer, org] = await Promise.all([
    CusPriceService.getRelatedToCusEnt({
      sb: sb,
      cusEnt,
    }),
    CusService.getById({
      sb: sb,
      id: cusEnt.customer_id,
      orgId: orgId,
      env: env,
    }),
    OrgService.getFullOrg({
      sb: sb,
      orgId: orgId,
    }),
  ]);

  return { cusPrice, customer, org };
};
export const handleUpdateEntitlement = async (req: any, res: any) => {
  try {
    const { customer_entitlement_id } = req.params;
    const { balance, next_reset_at } = req.body;

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

    // Get related cus price

    if (balance < 0 && !cusEnt.usage_allowed) {
      throw new RecaseError({
        message: "Entitlement does not allow usage",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    const deducted = new Decimal(cusEnt.balance!).minus(balance).toNumber();
    const adjustment = new Decimal(cusEnt.adjustment!)
      .minus(deducted)
      .toNumber();
    let originalBalance = cusEnt.balance;

    await CustomerEntitlementService.update({
      sb: req.sb,
      id: customer_entitlement_id,
      updates: { balance, next_reset_at, adjustment },
    });

    const { cusPrice, customer, org } = await getCusOrgAndCusPrice({
      sb: req.sb,
      cusEnt,
      orgId: req.orgId,
      env: req.env,
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
      originalBalance,
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
