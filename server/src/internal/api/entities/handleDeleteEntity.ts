import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { EntityService } from "./EntityService.js";
import { StatusCodes } from "http-status-codes";
import { ErrCode } from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleCustomerRaceCondition } from "@/external/redis/redisUtils.js";
import { getCusEntMasterBalance } from "@/internal/customers/entitlements/cusEntUtils.js";

export const handleDeleteEntity = async (req: any, res: any) => {
  try {
    const { orgId, env, logtail: logger, sb } = req;
    const { customer_id, entity_id } = req.params;

    
    await handleCustomerRaceCondition({
      action: "entity",
      customerId: customer_id,
      orgId,
      env,
      res,
      logger,
    });

    // console.log("Handling race condition for:", customer_id);
    // console.log("Customer ID:", customer_id);
    // console.log("Entity ID:", entity_id);


    const customer = await CusService.getById({
      sb: req.sb,
      id: customer_id,
      orgId: req.orgId,
      env: req.env,
      logger,
    });

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customer_id} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const existingEntities = await EntityService.get({
      sb: req.sb,
      internalCustomerId: customer.internal_id,
      orgId: req.orgId,
      env: req.env,
    });
    

    const entity = existingEntities.find(
      (e: any) => e.id === entity_id
    );

    if (!entity) {
      throw new RecaseError({
        message: `Entity ${entity_id} not found`,
        code: ErrCode.EntityNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    } else if (entity.deleted) {
      throw new RecaseError({
        message: `Entity ${entity_id} already deleted`,
        code: ErrCode.EntityAlreadyDeleted,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    const cusProducts = await CusService.getFullCusProducts({
      sb: req.sb,
      internalCustomerId: entity.internal_customer_id,
      withProduct: true,
      withPrices: true,
      logger,
    });

    const org = await OrgService.getFromReq(req);

    for (const cusProduct of cusProducts) {
      let cusEnts = cusProduct.customer_entitlements;
      let product = cusProduct.product;

      

      let cusEnt = cusEnts.find(
        (e: any) =>
          e.entitlement.feature.internal_id === entity.internal_feature_id
      );

      if (!cusEnt) {
        continue;
      }

      let {unused} = getCusEntMasterBalance({
        cusEnt,
        entities: existingEntities,
      });
      
      let newBalance = (cusEnt.balance + 1) + (unused || 0);
      
      await adjustAllowance({
        sb,
        env,
        org,
        cusPrices: cusProducts.flatMap((p: any) => p.customer_prices),
        customer,
        affectedFeature: cusEnt.entitlement.feature,
        cusEnt: { ...cusEnt, customer_product: cusProduct },
        originalBalance: cusEnt.balance + (unused || 0),
        newBalance,
        deduction: 1,
        product,
      });
    }

    await EntityService.update({
      sb,
      internalId: entity.internal_id,
      update: {
        deleted: true,
      },
    });

    logger.info(` ✅ Finished deleting entity ${entity_id}`);



    res.status(200).json({
      success: true,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "delete entity" });
  }
};
