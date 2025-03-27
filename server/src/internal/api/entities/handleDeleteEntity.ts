import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { EntityService } from "./EntityService.js";
import { StatusCodes } from "http-status-codes";
import { ErrCode } from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const handleDeleteEntity = async (req: any, res: any) => {
  try {
    const { orgId, env, logtail: logger, sb } = req;
    const entityId = req.params.entity_id;

    const entity = await EntityService.getById({
      sb: req.sb,
      entityId,
      orgId: req.orgId,
      env: req.env,
    });

    if (!entity) {
      throw new RecaseError({
        message: `Entity ${entityId} not found`,
        code: ErrCode.EntityNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    } else if (entity.deleted) {
      throw new RecaseError({
        message: `Entity ${entityId} already deleted`,
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

    const [customer, org] = await Promise.all([
      CusService.getByInternalId({
        sb: req.sb,
        internalId: entity.internal_customer_id,
      }),
      OrgService.getFromReq(req),
    ]);

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

      let newBalance = cusEnt.balance + 1;
      adjustAllowance({
        sb,
        env,
        org,
        cusPrices: cusProducts.flatMap((p: any) => p.customer_prices),
        customer,
        affectedFeature: cusEnt.entitlement.feature,
        cusEnt: { ...cusEnt, customer_product: cusProduct },
        originalBalance: cusEnt.balance,
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

    // If not X, delete entity AND entitlements...

    // await EntityService.update({
    //   sb: req.sb,
    //   internalId: entity.internal_id,
    //   update: {
    //     deleted: true,
    //   },
    // });

    // // console.log("Deleting entity:", entity);
    // const customer = await Promise.all([
    //   CusService.getByInternalId({
    //     sb: req.sb,
    //     internalId: entity.internal_customer_id,
    //   }),
    //   CusService.getFullCusProducts({
    //     sb: req.sb,
    //     internalCustomerId: entity.internal_customer_id,
    //     withProduct: true,
    //     withPrices: true,
    //     logger,
    //   }),
    // ]);

    // if (!customer) {
    //   throw new RecaseError({
    //     message: `Customer ${entity.internal_customer_id} not found`,
    //     code: ErrCode.CustomerNotFound,
    //     statusCode: StatusCodes.NOT_FOUND,
    //   });
    // }

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "delete entity" });
  }
};
