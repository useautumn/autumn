import { CusService } from "@/internal/customers/CusService.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { EntityService } from "./EntityService.js";
import {
  APIVersion,
  AppEnv,
  CusProductStatus,
  Entity,
  ErrCode,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { getActiveCusProductStatuses } from "@/utils/constants.js";

import {
  getCusEntMasterBalance,
  getUnlimitedAndUsageAllowed,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { getEntityResponse } from "./getEntityUtils.js";

export const constructEntity = ({
  inputEntity,
  feature,
  internalCustomerId,
  orgId,
  env,
}: {
  inputEntity: any;
  feature: any;
  internalCustomerId: string;
  orgId: string;
  env: AppEnv;
}) => {
  let entity: Entity = {
    internal_id: generateId("ety"),
    id: inputEntity.id,
    name: inputEntity.name,
    internal_customer_id: internalCustomerId,
    feature_id: feature.id,
    internal_feature_id: feature.internal_id,
    org_id: orgId,
    env,
    deleted: false,
    created_at: Date.now(),
  };

  return entity;
};

export const getEntityToAction = ({
  inputEntities,
  existingEntities,
  logger,
  feature,
  cusProducts,
}: {
  inputEntities: any[];
  existingEntities: Entity[];
  logger: any;
  feature: any;
  cusProducts: any[];
}) => {
  // 1. GET ENTITY TO ACTION
  let entityToAction: any = {};
  let createCount = 0;
  let replacedEntities: string[] = [];
  for (const inputEntity of inputEntities) {
    let curEntity = existingEntities.find((e: any) => e.id === inputEntity.id);

    if (curEntity && curEntity.deleted) {
      // Replace
      entityToAction[inputEntity.id] = {
        action: "replace",
        replace: curEntity,
        entity: inputEntity,
      };
      replacedEntities.push(curEntity.id);
      continue;
    }

    let replaced = false;
    for (const entity of existingEntities) {
      if (entity.deleted && !replacedEntities.includes(entity.id)) {
        replaced = true;
        replacedEntities.push(entity.id);

        entityToAction[inputEntity.id] = {
          action: "replace",
          replace: entity,
          entity: inputEntity,
        };
        break;
      }
    }

    if (!replaced) {
      // Create
      entityToAction[inputEntity.id] = {
        action: "create",
        entity: inputEntity,
      };
      createCount++;
    }
  }

  let cusEnts = cusProducts.flatMap((p: any) => p.customer_entitlements);
  let { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
    cusEnts,
    internalFeatureId: feature.internal_id,
  });

  if (unlimited || usageAllowed) {
    return entityToAction;
  }

  // let balance = cusEnts
  //   .filter(
  //     (ce: any) => ce.entitlement.feature.internal_id === feature.internal_id
  //   )
  //   .reduce((acc: number, ce: any) => acc + ce.balance, 0);

  // if (balance < createCount) {
  //   throw new RecaseError({
  //     message: `You don't have enough ${feature.name}`,
  //     code: ErrCode.InsufficientBalance,
  //   });
  // }

  return entityToAction;
};

export const logEntityToAction = ({
  entityToAction,
  logger,
}: {
  entityToAction: any;
  logger: any;
}) => {
  for (const id in entityToAction) {
    logger.info(
      `${id} - ${entityToAction[id].action}${
        entityToAction[id].replace
          ? ` (replace ${entityToAction[id].replace.id})`
          : ""
      }`
    );
  }
};
export const handleCreateEntity = async (req: any, res: any) => {
  try {
    // Create entity!

    const { sb, env, orgId, logtail: logger } = req;
    const { customer_id } = req.params;

    let [customer, features, org] = await Promise.all([
      CusService.getWithProducts({
        sb,
        idOrInternalId: customer_id,
        orgId,
        env,
        inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
        withEntities: true,
      }),
      FeatureService.getFromReq(req),
      OrgService.getFromReq(req),
    ]);

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customer_id} not found`,
        code: ErrCode.CustomerNotFound,
      });
    }

    let inputEntities: any[] = [];
    if (Array.isArray(req.body)) {
      inputEntities = req.body;
    } else {
      inputEntities = [req.body];
    }

    let featureIds = [...new Set(inputEntities.map((e: any) => e.feature_id))];
    if (featureIds.length > 1) {
      throw new RecaseError({
        message: "Multiple features not supported",
        code: ErrCode.InvalidInputs,
      });
    }

    let feature_id = featureIds[0];
    let feature = features.find((f: any) => f.id === feature_id);

    if (!feature) {
      throw new RecaseError({
        message: `Feature ${feature_id} not found`,
        code: ErrCode.FeatureNotFound,
      });
    }

    let cusProducts = await customer.customer_products;
    let existingEntities = customer.entities;

    logger.info("Existing entities:");
    logger.info(
      existingEntities.map(
        (e: any) => `${e.id} - ${e.name}, deleted: ${e.deleted}`
      )
    );

    for (const entity of existingEntities) {
      if (
        inputEntities.some((e: any) => e.id === entity.id) &&
        !entity.deleted
      ) {
        throw new RecaseError({
          message: `Entity ${entity.id} already exists`,
          code: "ENTITY_ALREADY_EXISTS",
          data: {
            entity,
          },
        });
      }
    }

    const entityToAction = getEntityToAction({
      inputEntities,
      existingEntities,
      logger,
      feature,
      cusProducts,
    });

    logger.info("Entity to action:");
    logEntityToAction({
      entityToAction,
      logger,
    });

    // 3. CREATE LINKED CUSTOMER ENTITLEMENTS
    for (const cusProduct of cusProducts) {
      let cusEnts = cusProduct.customer_entitlements;
      let product = cusProduct.product;
      let cusEnt = cusEnts.find(
        (e: any) => e.entitlement.feature.id === feature_id
      );

      if (!cusEnt) {
        continue;
      }

      // Get linked features
      let linkedCusEnts = cusEnts.filter(
        (e: any) => e.entitlement.entity_feature_id === feature.id
      );

      // 1. Pay for new seats
      let replacedCount = Object.keys(entityToAction).filter(
        (id) => entityToAction[id].action === "replace"
      ).length;
      let newCount = Object.keys(entityToAction).filter(
        (id) => entityToAction[id].action === "create"
      ).length;

      let { unused } = getCusEntMasterBalance({
        cusEnt,
        entities: existingEntities,
      });

      const originalBalance = cusEnt.balance + (unused || 0);
      const newBalance =
        cusEnt.balance - (newCount + replacedCount) + (unused || 0);

      await adjustAllowance({
        sb,
        env,
        org,
        cusPrices: cusProducts.flatMap((p: any) => p.customer_prices),
        customer,
        affectedFeature: feature,
        cusEnt: { ...cusEnt, customer_product: cusProduct },
        originalBalance,
        newBalance,
        deduction: newCount + replacedCount,
        product,
        replacedCount,
        fromEntities: true,
      });

      await req.pg.query(
        `UPDATE customer_entitlements SET balance = balance - $1 WHERE id = $2`,
        [newCount, cusEnt.id]
      );

      // For each linked feature, create customer entitlement for entity...
      for (const linkedCusEnt of linkedCusEnts) {
        let allowance = linkedCusEnt?.entitlement.allowance;
        let newEntities = linkedCusEnt?.entities || {};

        for (const entity of inputEntities) {
          let entityAction = entityToAction[entity.id];

          if (entityAction.action === "create") {
            newEntities[entity.id] = {
              id: entity.id,
              balance: allowance,
              adjustment: 0,
            };
          } else if (entityAction.action === "replace") {
            let tmp = newEntities[entityAction.replace.id];
            delete newEntities[entityAction.replace.id];
            newEntities[entity.id] = {
              id: entity.id,
              ...tmp,
            };
          }
        }

        await CustomerEntitlementService.update({
          sb,
          id: linkedCusEnt.id,
          updates: { entities: newEntities },
        });
      }
    }

    // 4. CREATE ENTITIES
    for (const id in entityToAction) {
      let { action, entity, replace } = entityToAction[id];

      // Create and add to customer entitlement?
      if (action === "create") {
        await EntityService.insert({
          sb,
          data: constructEntity({
            inputEntity: entity,
            feature,
            internalCustomerId: customer.internal_id,
            orgId,
            env,
          }),
        });
      } else if (action === "replace") {
        await EntityService.update({
          sb,
          internalId: replace.internal_id,
          update: {
            id: entity.id,
            name: entity.name,
            deleted: false,
          },
        });
      }
    }

    let apiVersion = org.api_version || APIVersion.v1;
    if (apiVersion < APIVersion.v1_2) {
      res.status(200).json({
        success: true,
      });
      return;
    }

    let { entities } = await getEntityResponse({
      sb,
      entityIds: inputEntities.map((e: any) => e.id),
      org,
      env,
      customerId: customer.id,
    });

    logger.info(`  Created / replaced entities!`);

    if (Array.isArray(req.body)) {
      res.status(200).json({
        list: entities,
      });
    } else {
      res.status(200).json(entities[0]);
    }
  } catch (error) {
    handleRequestError({ error, req, res, action: "create entity" });
  }
};
