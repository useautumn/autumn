import { CusService } from "@/internal/customers/CusService.js";
import { CusEntService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { EntityService } from "../EntityService.js";
import {
  APIVersion,
  AppEnv,
  CusProductStatus,
  Entity,
  ErrCode,
  Feature,
  Organization,
} from "@autumn/shared";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import {
  getCusEntMasterBalance,
  getRelatedCusPrice,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { getEntityResponse } from "../getEntityUtils.js";
import { StatusCodes } from "http-status-codes";
import { orgToVersion } from "@/utils/versionUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { routeHandler } from "@/utils/routerUtils.js";

interface CreateEntityData {
  id: string;
  name?: string;
  feature_id?: string;
}

export const constructEntity = ({
  inputEntity,
  feature,
  internalCustomerId,
  orgId,
  env,
  deleted = false,
}: {
  inputEntity: any;
  feature: any;
  internalCustomerId: string;
  orgId: string;
  env: AppEnv;
  deleted?: boolean;
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
    deleted,
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

      // If there's an entity with null ID and cur input entity has an ID, fill it up!

      if (
        nullish(entity.id) &&
        notNullish(inputEntity.id) &&
        !replacedEntities.includes(entity.internal_id) &&
        entity.feature_id === feature.id
      ) {
        entityToAction[inputEntity.id] = {
          action: "replace",
          replace: entity,
          entity: inputEntity,
        };

        replacedEntities.push(entity.internal_id);
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      entityToAction[inputEntity.id] = {
        action: "create",
        entity: inputEntity,
      };
      createCount++;
    }
  }

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
          ? ` (replace ${
              entityToAction[id].replace.id ||
              entityToAction[id].replace.internal_id
            })`
          : ""
      }`,
    );
  }
};

export const validateAndGetInputEntities = async ({
  sb,
  orgId,
  features,
  customerId,
  createEntityData,
  env,
  logger,
}: {
  sb: any;
  orgId: string;
  features: Feature[];
  customerId: string;
  env: AppEnv;
  createEntityData: CreateEntityData[] | CreateEntityData;
  logger: any;
}) => {
  // 1. Get customer, features and orgs
  let customer = await CusService.getWithProducts({
    sb,
    idOrInternalId: customerId,
    orgId,
    env,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    withEntities: true,
  });

  if (!customer) {
    throw new RecaseError({
      message: `Customer ${customerId} not found`,
      code: ErrCode.CustomerNotFound,
    });
  }

  // 2. Get input entities
  let inputEntities: any[] = [];
  if (Array.isArray(createEntityData)) {
    inputEntities = createEntityData;
  } else {
    inputEntities = [createEntityData];
  }

  let featureIds = [...new Set(inputEntities.map((e: any) => e.feature_id))];
  if (featureIds.length > 1) {
    throw new RecaseError({
      message: "Multiple features not supported",
      code: ErrCode.InvalidInputs,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  let feature_id = featureIds[0];
  let feature = features.find((f: any) => f.id === feature_id);

  if (!feature) {
    throw new RecaseError({
      message: `Create entity failed: feature ${feature_id} not found`,
      code: ErrCode.FeatureNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  let cusProducts = await customer.customer_products;
  let existingEntities = customer.entities;

  logger.info("Existing entities:");
  logger.info(
    existingEntities.map(
      (e: any) => `${e.id} - ${e.name}, deleted: ${e.deleted}`,
    ),
  );

  let noIdEntities = existingEntities.filter((e: any) => !e.id);
  let noIdNewEntities = inputEntities.filter((e: any) => !e.id);
  if (noIdEntities.length + noIdNewEntities.length > 1) {
    throw new RecaseError({
      message: "Can only have one entity with no ID",
      code: ErrCode.EntityIdRequired,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  for (const entity of existingEntities) {
    if (inputEntities.some((e: any) => e.id === entity.id) && !entity.deleted) {
      throw new RecaseError({
        message: `Entity ${entity.id} already exists`,
        code: "ENTITY_ALREADY_EXISTS",
        data: {
          entity,
        },
        statusCode: StatusCodes.CONFLICT,
      });
    }
  }

  return {
    customer,
    features,
    inputEntities,
    feature_id,
    feature,
    cusProducts,
    existingEntities,
  };
};

export const createEntities = async ({
  db,
  sb,
  env,
  org,
  features,
  logger,
  customerId,
  createEntityData,
  withAutumnId = false,
  apiVersion,
  fromAutoCreate = false,
}: {
  db: DrizzleCli;
  sb: any;
  org: Organization;
  features: Feature[];
  env: AppEnv;
  logger: any;
  customerId: string;
  createEntityData: CreateEntityData[] | CreateEntityData;
  withAutumnId?: boolean;
  apiVersion?: APIVersion;
  fromAutoCreate?: boolean;
}) => {
  const {
    customer,
    inputEntities,
    feature_id,
    feature,
    cusProducts,
    existingEntities,
  } = await validateAndGetInputEntities({
    sb,
    customerId,
    orgId: org.id,
    env,
    logger,
    createEntityData,
    features,
  });

  const entityToAction = getEntityToAction({
    inputEntities,
    existingEntities,
    logger,
    feature,
    cusProducts,
  });

  logEntityToAction({
    entityToAction,
    logger,
  });

  // 3. CREATE LINKED CUSTOMER ENTITLEMENTS
  for (const cusProduct of cusProducts) {
    let cusEnts = cusProduct.customer_entitlements;
    let product = cusProduct.product;

    let mainCusEnt = cusEnts.find(
      (e: any) => e.entitlement.feature.id === feature_id,
    );

    // Get linked features
    let linkedCusEnts = cusEnts.filter(
      (e: any) => e.entitlement.entity_feature_id === feature.id,
    );

    if (linkedCusEnts.length > 0 && inputEntities.some((e: any) => !e.id)) {
      throw new RecaseError({
        message: "Entity ID is required",
        code: ErrCode.EntityIdRequired,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // 1. Pay for new seats
    let replacedCount = Object.keys(entityToAction).filter(
      (id) => entityToAction[id].action === "replace",
    ).length;

    let newCount = Object.keys(entityToAction).filter(
      (id) => entityToAction[id].action === "create",
    ).length;

    if (mainCusEnt) {
      if (fromAutoCreate) {
        let cusPrice = getRelatedCusPrice(
          mainCusEnt,
          cusProduct.customer_prices || [],
        );

        if (cusPrice) {
          return [];
        }
      }

      let { unused } = getCusEntMasterBalance({
        cusEnt: mainCusEnt,
        entities: existingEntities,
      });

      const originalBalance = mainCusEnt.balance + (unused || 0);
      const newBalance =
        mainCusEnt.balance - (newCount + replacedCount) + (unused || 0);

      await adjustAllowance({
        db,
        sb,
        env,
        org,
        cusPrices: cusProducts.flatMap((p: any) => p.customer_prices),
        customer,
        affectedFeature: feature,
        cusEnt: { ...mainCusEnt, customer_product: cusProduct },
        originalBalance,
        newBalance,
        deduction: newCount + replacedCount,
        product,
        replacedCount,
        fromEntities: true,
      });

      await CusEntService.update({
        db,
        id: mainCusEnt.id,
        updates: { balance: mainCusEnt.balance - newCount },
      });

      // await pg.query(
      //   `UPDATE customer_entitlements SET balance = balance - $1 WHERE id = $2`,
      //   [newCount, mainCusEnt.id]
      // );
    }

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

      await CusEntService.update({
        db,
        id: linkedCusEnt.id,
        updates: { entities: newEntities },
      });
    }
  }

  // 4. CREATE ENTITIES
  let newEntities: Entity[] = [];
  for (const id in entityToAction) {
    let { action, entity, replace } = entityToAction[id];

    // Create and add to customer entitlement?
    if (action === "create") {
      let results = await EntityService.insert({
        db,
        data: constructEntity({
          inputEntity: entity,
          feature,
          internalCustomerId: customer.internal_id,
          orgId: org.id,
          env,
        }),
      });

      newEntities.push(results[0]);
    } else if (action === "replace") {
      let updatedEntity = await EntityService.update({
        db,
        internalId: replace.internal_id,
        update: {
          id: entity.id,
          name: entity.name,
          deleted: false,
        },
      });

      newEntities.push(updatedEntity);
    }
  }

  if (fromAutoCreate) {
    return newEntities;
  }

  let { entities } = await getEntityResponse({
    sb,
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
      const { sb, env, db, logtail: logger } = req;

      const [org, features] = await Promise.all([
        OrgService.getFromReq(req),
        FeatureService.getFromReq(req),
      ]);

      let apiVersion = orgToVersion({
        org,
        reqApiVersion: req.apiVersion,
      });

      const entities = await createEntities({
        db,
        sb,
        org,
        features,
        logger,
        env,
        customerId: req.params.customer_id,
        createEntityData: req.body,
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
