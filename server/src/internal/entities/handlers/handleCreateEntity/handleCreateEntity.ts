import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { EntityService } from "../../../api/entities/EntityService.js";
import { APIVersion, CreateEntity, CustomerData } from "@autumn/shared";
import { getEntityResponse } from "../../../api/entities/getEntityUtils.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { constructEntity } from "../../entityUtils/entityUtils.js";
import { validateAndGetInputEntities } from "./getInputEntities.js";
import { createEntityForCusProduct } from "./createEntityForCusProduct.js";

export const createEntities = async ({
  req,
  logger,
  customerId,
  customerData,
  createEntityData,
  withAutumnId = false,
  apiVersion,
  fromAutoCreate = false,
}: {
  req: ExtendedRequest;
  customerData?: CustomerData;
  logger: any;
  customerId: string;
  createEntityData: CreateEntity[] | CreateEntity;
  withAutumnId?: boolean;
  apiVersion?: APIVersion;
  fromAutoCreate?: boolean;
}) => {
  const { db, org, env } = req;

  // 1. Get data
  const {
    customer,
    inputEntities,
    feature_id,
    feature,
    cusProducts,
    existingEntities,
  } = await validateAndGetInputEntities({
    req,
    customerId,
    customerData,
    createEntityData,
    logger,
  });

  // const entityToAction = getEntityToAction({
  //   inputEntities,
  //   existingEntities,
  //   feature,
  //   logger,
  // });

  for (const cusProduct of cusProducts) {
    await createEntityForCusProduct({
      req,
      feature,
      customer,
      cusProduct,
      inputEntities,
      logger,
    });
    // let cusEnts = cusProduct.customer_entitlements;
    // let product = cusProduct.product;

    // let mainCusEnt = cusEnts.find(
    //   (e: any) => e.entitlement.feature.id === feature_id,
    // );

    // let linkedCusEnts = cusEnts.filter(
    //   (e: any) => e.entitlement.entity_feature_id === feature.id,
    // );

    // if (linkedCusEnts.length > 0 && inputEntities.some((e: any) => !e.id)) {
    //   throw new RecaseError({
    //     message: "Entity ID is required",
    //     code: ErrCode.EntityIdRequired,
    //     statusCode: StatusCodes.BAD_REQUEST,
    //   });
    // }

    // let replacedCount = Object.keys(entityToAction).filter(
    //   (id) => entityToAction[id].action === "replace",
    // ).length;

    // let newCount = Object.keys(entityToAction).filter(
    //   (id) => entityToAction[id].action === "create",
    // ).length;

    // if (mainCusEnt) {
    //   if (fromAutoCreate) {
    //     let cusPrice = getRelatedCusPrice(
    //       mainCusEnt,
    //       cusProduct.customer_prices || [],
    //     );

    //     if (cusPrice) {
    //       return [];
    //     }
    //   }

    //   let { unused } = getCusEntMasterBalance({
    //     cusEnt: mainCusEnt,
    //     entities: existingEntities,
    //   });

    //   let mainCusEntBalance = mainCusEnt.balance || 0;
    // const originalBalance = mainCusEntBalance + (unused || 0);
    // const newBalance =
    //   mainCusEntBalance - (newCount + replacedCount) + (unused || 0);

    //   await adjustAllowance({
    //     db,

    //     env,
    //     org,
    //     cusPrices: cusProducts.flatMap((p: any) => p.customer_prices),
    //     customer,
    //     affectedFeature: feature,
    //     cusEnt: { ...mainCusEnt, customer_product: cusProduct },
    //     originalBalance,
    //     newBalance,
    //     deduction: newCount + replacedCount,
    //     product,
    //     replacedCount,
    //     fromEntities: true,
    //   });

    //   await CusEntService.update({
    //     db,
    //     id: mainCusEnt.id,
    //     updates: { balance: mainCusEntBalance - newCount },
    //   });
    // }

    // // Linked cus ent stuff...
    // for (const linkedCusEnt of linkedCusEnts) {
    //   let allowance = linkedCusEnt?.entitlement.allowance;
    //   let newEntities = linkedCusEnt?.entities || {};

    //   for (const entity of inputEntities) {
    //     let entityAction = entityToAction[entity.id];

    //     if (entityAction.action === "create") {
    //       newEntities[entity.id] = {
    //         id: entity.id,
    //         balance: allowance!,
    //         adjustment: 0,
    //       };
    //     } else if (entityAction.action === "replace") {
    //       let tmp = newEntities[entityAction.replace.id];
    //       delete newEntities[entityAction.replace.id];
    //       newEntities[entity.id] = {
    //         ...tmp,
    //         id: entity.id,
    //       };
    //     }
    //   }

    //   await CusEntService.update({
    //     db,
    //     id: linkedCusEnt.id,
    //     updates: { entities: newEntities },
    //   });
    // }
  }

  let data = inputEntities.map((e: any) =>
    constructEntity({
      inputEntity: e,
      feature,
      internalCustomerId: customer.internal_id,
      orgId: org.id,
      env,
    }),
  );

  let newEntities = await EntityService.insert({
    db,
    data,
  });

  // 4. CREATE ENTITIES
  // let newEntities: Entity[] = [];
  // for (const id in entityToAction) {
  //   let { action, entity, replace } = entityToAction[id];

  //   // Create and add to customer entitlement?
  //   if (action === "create") {
  //     let results = await EntityService.insert({
  //       db,
  //       data: constructEntity({
  //         inputEntity: entity,
  //         feature,
  //         internalCustomerId: customer.internal_id,
  //         orgId: org.id,
  //         env,
  //       }),
  //     });

  //     newEntities.push(results[0]);
  //   } else if (action === "replace") {
  //     let updatedEntity = await EntityService.update({
  //       db,
  //       internalId: replace.internal_id,
  //       update: {
  //         id: entity.id,
  //         name: entity.name,
  //         deleted: false,
  //       },
  //     });

  //     newEntities.push(updatedEntity);
  //   }
  // }

  if (fromAutoCreate) {
    return newEntities;
  }

  let { entities } = await getEntityResponse({
    db,
    entityIds: inputEntities.map((e: any) => e.id),
    org,
    env,
    customerId: customer.id || customer.internal_id,
    withAutumnId,
    apiVersion: apiVersion!,
  });

  return entities;
};

export const handlePostEntityRequest = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "create entity",
    handler: async (req: any, res: any) => {
      const { env, db, logtail: logger } = req;

      const [org, features] = await Promise.all([
        OrgService.getFromReq(req),
        FeatureService.getFromReq(req),
      ]);

      let apiVersion = orgToVersion({
        org,
        reqApiVersion: req.apiVersion,
      });

      let customerData =
        Array.isArray(req.body) && req.body.length > 0
          ? req.body[0].customer_data
          : req.body.customer_data;

      const entities = await createEntities({
        req,
        logger,
        customerId: req.params.customer_id,
        createEntityData: req.body,
        customerData,
        withAutumnId: req.query.with_autumn_id === "true",
        apiVersion,
      });

      logger.info(`  Created / replaced entities!`);

      if (apiVersion < APIVersion.v1_2) {
        res.status(200).json({
          success: true,
        });
        return;
      }
      if (Array.isArray(req.body)) {
        res.status(200).json({
          list: entities,
        });
      } else {
        res.status(200).json(entities[0]);
      }
    },
  });
