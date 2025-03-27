import { CusService } from "@/internal/customers/CusService.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { getLinkedCusEnt } from "./entityUtils.js";
import { EntityService } from "./EntityService.js";
import { AppEnv, CusProductStatus, Entity } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";

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
  for (const inputEntity of inputEntities) {
    let curEntity = existingEntities.find((e: any) => e.id === inputEntity.id);

    if (curEntity && !curEntity.deleted) {
      // Replace
      entityToAction[inputEntity.id] = {
        action: "replace",
        replace: curEntity,
        entity: inputEntity,
      };
    }

    let replaced = false;
    for (const entity of existingEntities) {
      if (
        entity.deleted &&
        !Object.keys(entityToAction).some((id) => id === entity.id)
      ) {
        replaced = true;
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
        inputEntity,
      };
      createCount++;
    }
  }
  logger.info("Entity to action:");
  logger.info(entityToAction);

  // 2. CHECK THAT PRODUCTS HAVE ENOUGH BALANCE
  for (const cusProduct of cusProducts) {
    let cusEnts = cusProduct.customer_entitlements;
    let product = cusProduct.product;
    let cusEnt = cusEnts.find(
      (e: any) => e.entitlement.feature.id === feature.id
    );

    if (!cusEnt || cusEnt.usage_allowed) {
      continue;
    }

    if (cusEnt.balance < createCount) {
      throw new RecaseError({
        message: `Product: ${product.name}, Feature: ${feature.name}, insufficient balance`,
        code: "INSUFFICIENT_BALANCE",
        data: {
          cusEnt,
        },
      });
    }
  }

  return entityToAction;
};

export const handleCreateEntity = async (req: any, res: any) => {
  try {
    // Create entity!

    const { sb, env, orgId, logtail: logger } = req;
    const { customer_id, feature_id, entity: inputEntities } = req.body;

    let [customer, features, org] = await Promise.all([
      CusService.getByIdOrInternalId({
        sb,
        idOrInternalId: customer_id,
        orgId,
        env,
      }),
      FeatureService.getFromReq(req),
      OrgService.getFromReq(req),
    ]);

    let feature = features.find((f: any) => f.id === feature_id);

    let cusProducts = await CusService.getFullCusProducts({
      sb,
      internalCustomerId: customer.internal_id,
      withProduct: true,
      withPrices: true,
      inStatuses: [CusProductStatus.Active],
      logger,
    });

    // Fetch existing
    let existingEntities = await EntityService.getInIds({
      sb,
      ids: inputEntities.map((e: any) => e.id),
      orgId,
      env,
      internalFeatureId: feature.internal_id,
    });

    for (const entity of existingEntities) {
      if (entity && !entity.deleted) {
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

    // 3. CREATE ENTITIES
    for (const id in entityToAction) {
      let { action, inputEntity, replace } = entityToAction[id];

      // Create and add to customer entitlement?
      if (action === "create") {
        await EntityService.insert({
          sb,
          data: constructEntity({
            inputEntity,
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
            deleted: false,
          },
        });
      }
    }
    logger.info(`  Created / replaced entities!`);

    // 4. CREATE LINKED CUSTOMER ENTITLEMENTS
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

      // For each linked feature, create customer entitlement for entity...
      for (const linkedCusEnt of linkedCusEnts) {
        // let linkedCusEnt = getLinkedCusEnt({
        //   linkedFeature,
        //   cusEnts,
        // });

        // console.log("linkedCusEnt", linkedCusEnt?.entitlement.feature.id);
        let allowance = linkedCusEnt?.entitlement.allowance;
        let newEntities = linkedCusEnt?.entities || {};

        for (const entity of inputEntities) {
          let entityAction = entityToAction[entity.id];

          if (entityAction.action === "create") {
            newEntities[entity.id] = {
              balance: allowance,
              adjustment: 0,
            };
          } else if (entityAction.action === "replace") {
            let tmp = newEntities[entityAction.replace.id];
            delete newEntities[entityAction.replace.id];
            newEntities[entity.id] = tmp;
          }
        }

        await CustomerEntitlementService.update({
          sb,
          id: linkedCusEnt.id,
          updates: { entities: newEntities },
        });
      }

      // 2. Update main customer entitlement (decrement balance)

      let replacedCount = Object.keys(entityToAction).filter(
        (id) => entityToAction[id].action === "replace"
      ).length;
      let newCount = Object.keys(entityToAction).filter(
        (id) => entityToAction[id].action === "create"
      ).length;

      await req.pg.query(
        `UPDATE customer_entitlements SET balance = balance - $1 WHERE id = $2`,
        [newCount, cusEnt.id]
      );

      adjustAllowance({
        sb,
        env,
        org,
        cusPrices: cusProducts.flatMap((p: any) => p.customer_prices),
        customer,
        affectedFeature: feature,
        cusEnt: { ...cusEnt, customer_product: cusProduct },
        originalBalance: cusEnt.balance,
        newBalance: cusEnt.balance - (newCount + replacedCount),
        deduction: newCount + replacedCount,
        product,
        replacedCount,
      });
    }

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "create entity" });
  }
};
