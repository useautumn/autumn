import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getResetBalance } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import {
  findLinkedCusEnts,
  findMainCusEntForFeature,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  CreateEntity,
  Feature,
  FullCusProduct,
  FullCustomer,
  FullCustomerEntitlement,
  Replaceable,
} from "@autumn/shared";

export const updateLinkedCusEnt = async ({
  db,
  linkedCusEnt,
  inputEntities,
  entityToReplacement,
}: {
  db: DrizzleCli;
  linkedCusEnt: FullCustomerEntitlement;
  inputEntities: CreateEntity[];
  entityToReplacement: Record<string, string>;
}) => {
  let newEntities = structuredClone(linkedCusEnt.entities) || {};
  for (const entity of inputEntities) {
    let replaceableId = entityToReplacement[entity.id];
    let replaceableInEntities = replaceableId
      ? newEntities[replaceableId]
      : null;

    if (replaceableInEntities) {
      newEntities[entity.id] = {
        ...replaceableInEntities,
        id: entity.id,
      };
      delete newEntities[replaceableId];
    } else {
      let balance = linkedCusEnt.entitlement.allowance!;
      newEntities[entity.id] = {
        id: entity.id,
        balance,
        adjustment: 0,
      };
    }

    await CusEntService.update({
      db,
      id: linkedCusEnt.id,
      updates: {
        entities: newEntities,
      },
    });
  }
};

export const createEntityForCusProduct = async ({
  req,
  // feature,
  customer,
  cusProduct,
  inputEntities,
  logger,
}: {
  req: ExtendedRequest;
  // feature: Feature;
  customer: FullCustomer;
  cusProduct: FullCusProduct;
  inputEntities: CreateEntity[];
  logger: any;
}) => {
  const featureToEntities = inputEntities.reduce(
    (acc, entity) => {
      acc[entity.feature_id!] = [...(acc[entity.feature_id!] || []), entity];
      return acc;
    },
    {} as Record<string, CreateEntity[]>,
  );

  const { db, env, org, features } = req;

  const cusEnts = cusProduct.customer_entitlements;
  const cusPrices = cusProduct.customer_prices;

  for (const featureId in featureToEntities) {
    const inputEntities = featureToEntities[featureId]!;
    const feature = features.find((f: any) => f.id === featureId)!;

    const mainCusEnt = findMainCusEntForFeature({
      cusEnts,
      feature,
    });

    // 1. If main cus ent:
    let deletedReplaceables: Replaceable[] = [];
    if (mainCusEnt) {
      const originalBalance = mainCusEnt.balance || 0;
      const newBalance = originalBalance - inputEntities.length;

      const { deletedReplaceables: deletedReplaceables_, invoice } =
        await adjustAllowance({
          db,
          env,
          org,
          cusPrices,
          customer,
          affectedFeature: feature,
          cusEnt: { ...mainCusEnt, customer_product: cusProduct },
          originalBalance,
          newBalance,
          logger,
          errorIfIncomplete: true,
        });

      deletedReplaceables = deletedReplaceables_ || [];

      await CusEntService.decrement({
        db,
        id: mainCusEnt.id,
        amount: inputEntities.length - deletedReplaceables.length,
      });
    }

    const entityToReplacement: Record<string, string> = {};
    for (let i = 0; i < deletedReplaceables.length; i++) {
      const replaceable = deletedReplaceables[i];
      entityToReplacement[inputEntities[i].id] = replaceable.id;

      if (i >= inputEntities.length) {
        break;
      }
    }

    const linkedCusEnts = findLinkedCusEnts({
      cusEnts,
      feature,
    });

    for (const linkedCusEnt of linkedCusEnts) {
      await updateLinkedCusEnt({
        db,
        linkedCusEnt,
        inputEntities,
        entityToReplacement,
      });
    }
  }
};
