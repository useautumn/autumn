import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import {
  CreateEntitySchema,
  EntitySchema,
} from "@shared/models/cusModels/entityModels/entityModels.js";
import { z } from "zod";

export const handleCreateEntity = async (req: any, res: any) => {
  try {
    // Create entity!

    let data = req.body;
    let createEntites: any[] = Array.isArray(data) ? data : [data];
    const { sb, env, orgId } = req;

    // 1. Parse entities
    const parsedEntities = z.array(CreateEntitySchema).parse(createEntites);

    console.log("Parsed entities:", parsedEntities);
    let cusIds = parsedEntities.map((entity) => entity.customer_id);

    let [customers, features, org] = await Promise.all([
      CusService.getInIds({ cusIds, orgId, env, sb }),
      FeatureService.getFromReq(req),
      OrgService.getFromReq(req),
    ]);

    // 2. For each entity
    for (const entity of parsedEntities) {
      // 1. Get feature and customer
      let feature = features.find((f) => f.id === entity.feature_id);
      let customer = customers.find((c) => c.id === entity.customer_id);

      // 2. Create entitlement for entity, customer and feature?
    }
    // for (const linkedFeature of linkedFeatures) {
    //   const linkedCusEnt = getLinkedCusEnt({
    //     linkedFeature,
    //     cusEnts,
    //   });

    //   const groupVal = getGroupValFromProperties({
    //     properties: event.add_groups || event.remove_groups,
    //     feature: linkedFeature,
    //   });

    //   // console.log("Group val:", groupVal);
    //   // console.log("Linked feature:", linkedFeature);

    //   if (!groupVal) {
    //     continue;
    //   }

    //   let isAdding = notNullish(event.add_groups);
    //   event.value = isAdding ? groupVal.length : -groupVal.length;
    //   const allowance = linkedCusEnt?.entitlement.allowance;

    //   if (isAdding) {
    //     let curBalances = linkedCusEnt?.balances || {};

    //     for (const group of groupVal) {
    //       // Check if group already exists & is not deleted
    //       if (curBalances[group] && !curBalances[group].deleted) {
    //         logger.warn(
    //           `   - Group ${group} already exists & is not deleted, skipping`
    //         );
    //         replacedCount++;
    //         event.value! -= 1;
    //         continue;
    //       }

    //       if (curBalances[group] && curBalances[group].deleted) {
    //         curBalances[group].deleted = false;
    //         console.log(`   - Undeleting group ${group}`);
    //         // replacedCount++;
    //         event.value! -= 1;
    //         continue;
    //       }

    //       // Check if there's any deleted balance to activate
    //       let replaced = false;
    //       for (const id in curBalances) {
    //         let balance = curBalances[id];
    //         if (balance.deleted) {
    //           curBalances[group] = {
    //             ...balance,
    //             deleted: false,
    //           };

    //           delete curBalances[id];
    //           // replacedCount++;
    //           event.value = (event.value || 1) - 1;
    //           break;
    //         }
    //       }

    //       if (!replaced) {
    //         curBalances[group] = {
    //           balance: allowance!,
    //           adjustment: 0,
    //         };
    //       }
    //     }

    //     await CustomerEntitlementService.update({
    //       sb,
    //       id: linkedCusEnt!.id,
    //       updates: { balances: curBalances },
    //     });
    //   } else {
    //     const curBalances = linkedCusEnt?.balances || {};
    //     event.value = 0;
    //     for (const group of groupVal) {
    //       if (curBalances[group]) {
    //         curBalances[group].deleted = true;
    //         replacedCount++;
    //       } else {
    //         logger.warn(
    //           `   - Group ${group} not found for linked feature ${linkedFeature.id}, can't delete`
    //         );
    //         throw new RecaseError({
    //           message: `Group ${group} not found for linked feature ${linkedFeature.id}, can't delete`,
    //           code: "GROUP_NOT_FOUND",
    //           data: {
    //             group,
    //             linkedFeature,
    //           },
    //         });
    //       }
    //     }

    //     await CustomerEntitlementService.update({
    //       sb,
    //       id: linkedCusEnt!.id,
    //       updates: { balances: curBalances },
    //     });
    //   }
    // }

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "create entity" });
  }
};
