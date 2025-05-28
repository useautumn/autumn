import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { EntityService } from "../EntityService.js";
import { StatusCodes } from "http-status-codes";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleCustomerRaceCondition } from "@/external/redis/redisUtils.js";
import {
  getCusEntMasterBalance,
  getRelatedCusPrice,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { fullCusProductToCusEnts } from "@/internal/customers/products/cusProductUtils.js";
import { removeEntityFromCusEnt } from "../entityUtils.js";
import { CusEntService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { cancelCurSubs } from "@/internal/customers/change-product/handleDowngrade/cancelCurSubs.js";
import { removeScheduledProduct } from "../../customers/handlers/handleCusProductExpired.js";

export const handleDeleteEntity = async (req: any, res: any) => {
  try {
    const { orgId, env, db, logtail: logger } = req;
    const { customer_id, entity_id } = req.params;

    await handleCustomerRaceCondition({
      action: "entity",
      customerId: customer_id,
      orgId,
      env,
      res,
      logger,
    });

    const customer = await CusService.getFull({
      db,
      idOrInternalId: customer_id,
      orgId: req.orgId,
      env: req.env,
      withEntities: true,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
    });

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customer_id} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const existingEntities = customer.entities;
    const cusProducts = customer.customer_products;

    const entity = existingEntities.find((e: any) => e.id === entity_id);

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

    const org = await OrgService.getFromReq(req);

    let cusPriceExists = false;

    for (const cusProduct of cusProducts) {
      let cusEnts = cusProduct.customer_entitlements;
      let product = cusProduct.product;

      let cusEnt = cusEnts.find(
        (e: any) =>
          e.entitlement.feature.internal_id === entity.internal_feature_id,
      );

      if (!cusEnt) {
        continue;
      }

      let relatedCusPrice = getRelatedCusPrice(
        cusEnt,
        cusProduct.customer_prices,
      );

      if (relatedCusPrice) {
        cusPriceExists = true;
      }

      let { unused } = getCusEntMasterBalance({
        cusEnt,
        entities: existingEntities,
      });

      let newBalance = (cusEnt.balance || 0) + 1 + (unused || 0);

      await adjustAllowance({
        db,
        env,
        org,
        cusPrices: cusProducts.flatMap((p: any) => p.customer_prices),
        customer,
        affectedFeature: cusEnt.entitlement.feature,
        cusEnt: { ...cusEnt, customer_product: cusProduct },
        originalBalance: (cusEnt.balance || 0) + (unused || 0),
        newBalance,
        deduction: 1,
        product,
        fromEntities: true,
      });
    }

    if (!cusPriceExists || org.config.prorate_unused) {
      // Completely remove entity
      let cusEnts = fullCusProductToCusEnts(cusProducts);

      // TODO: Charge for unused feature IDs...

      for (const cusEnt of cusEnts) {
        let relatedCusPrice = getRelatedCusPrice(
          cusEnt,
          cusProducts.flatMap((p: any) => p.customer_prices),
        );
        await removeEntityFromCusEnt({
          db,
          cusEnt,
          entity,
          logger,
          cusPrice: relatedCusPrice,
          customer,
          org,
          env,
        });
      }

      try {
        let stripeCli = createStripeCli({ org, env });
        let curSubs = await getStripeSubs({
          stripeCli,
          subIds: cusProducts.flatMap((p: any) => p.subscription_ids),
        });

        for (const cusProduct of cusProducts) {
          if (cusProduct.internal_entity_id !== entity.internal_id) {
            continue;
          }

          if (cusProduct.status == CusProductStatus.Scheduled) {
            await removeScheduledProduct({
              db,
              cusProduct,
              cusProducts,
              org,
              env,
              logger,
              renewCurProduct: false,
            });
          } else {
            await cancelCurSubs({
              curCusProduct: cusProduct,
              curSubs,
              stripeCli,
            });
          }
        }
      } catch (error) {
        logger.error("FAILED TO CANCEL SUBS FOR DELETED ENTITY", error);
      }

      // Perform deduction on cus ent
      let updateCusEnt = cusEnts.find(
        (e: any) => e.entitlement.feature.id === entity.feature_id,
      );
      if (updateCusEnt) {
        await CusEntService.increment({
          db,
          id: updateCusEnt.id,
          amount: 1,
        });
      }

      await EntityService.deleteInInternalIds({
        db,
        internalIds: [entity.internal_id],
        orgId: req.orgId,
        env: req.env,
      });
    } else {
      await EntityService.update({
        db,
        internalId: entity.internal_id,
        update: {
          deleted: true,
        },
      });
    }

    logger.info(` ✅ Finished deleting entity ${entity_id}`);

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "delete entity" });
  }
};
