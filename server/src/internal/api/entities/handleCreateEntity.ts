import { CusService } from "@/internal/customers/CusService.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { getLinkedCusEnt } from "./entityUtils.js";
import { EntityService } from "./EntityService.js";
import { AppEnv, CusProductStatus, Customer, Entity, FullCusProduct, FullCustomerEntitlement, FullCustomerPrice, Product } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { getActiveCusProductStatuses } from "@/utils/constants.js";
import { isTrialing } from "@/internal/customers/products/cusProductUtils.js";
import {Decimal} from "decimal.js";
import { getPriceForOverage } from "@/internal/prices/priceUtils.js";
import { Logger } from "@slack/web-api";
import Stripe from "stripe";
import { getCusEntMasterBalance } from "@/internal/customers/entitlements/cusEntUtils.js";

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
      if (
        entity.deleted &&
        !replacedEntities.includes(entity.id)
      ) {
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

// export const payForEntitiesImmediately = async ({
//   sb,
//   env,
//   org,
//   cusProduct,
//   cusEnt,
//   cusPrice,
//   logger,
//   oldUsage,
//   createdNumber,
//   stripeCli,
//   product,
//   customer,
// }:{
//   cusProduct: FullCusProduct;
//   cusEnt: FullCustomerEntitlement;
//   cusPrice: FullCustomerPrice;
//   logger: Logger;
//   oldUsage: number;
//   createdNumber: number;
//   stripeCli: Stripe;
//   product: Product;
//   customer: Customer;
// }) => {
//   if (!isTrialing(cusProduct as FullCusProduct)) {
//     // let entitlement = cusEnt.entitlement;
//     // let newUsage = entitlement.allowance! - newBalance;
//     // let oldUsage = entitlement.allowance! - originalBalance;
//     // newUsage = newUsage - (replacedCount || 0);

//     // let newAmount = getPriceForOverage(cusPrice.price, newUsage);
//     // let oldAmount = getPriceForOverage(cusPrice.price, oldUsage);

//     const stripeAmount = new Decimal(newAmount)
//       .sub(oldAmount)
//       .mul(100)
//       .round()
//       .toNumber();

//     logger.info(`   - Stripe amount: ${stripeAmount}`);

//     if (stripeAmount > 0) {
//       const invoice = await stripeCli.invoices.create({
//         customer: customer.processor.id,
//         auto_advance: false,
//         subscription: sub.id,
//       });

//       await stripeCli.invoiceItems.create({
//         customer: customer.processor.id,
//         invoice: invoice.id,
//         quantity: 1,
//         description: `${product!.name} - ${
//           affectedFeature.name
//         } x ${Math.round(newUsage - oldUsage)}`,

//         price_data: {
//           product: config.stripe_product_id!,
//           unit_amount: stripeAmount,
//           currency: org.default_currency,
//         },
//       });
      

//       const { paid, error } = await payForInvoice({
//         fullOrg: org,
//         env,
//         customer,
//         invoice,
//         logger,
//       });

      
//       // console.log("Invoice paid result:", paid, error);
//       const latestInvoice = await stripeCli.invoices.retrieve(invoice.id, {
//         ...getInvoiceExpansion()
//       });

//       await InvoiceService.createInvoiceFromStripe({
//         sb,
//         stripeInvoice: latestInvoice,
//         internalCustomerId: customer.internal_id,
//         org,
//         productIds: [product!.id],
//         internalProductIds: [product!.internal_id],
//       });

//       if (!paid) {
//         logger.warn("❗️ Failed to pay for invoice!");
//       }
//     }
//   }
// };

export const handleCreateEntity = async (req: any, res: any) => {
  try {
    // Create entity!

    const { sb, env, orgId, logtail: logger } = req;
    const { customer_id } = req.params;

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
        code: "MULTIPLE_FEATURES_NOT_SUPPORTED",
      });
    }

    let feature_id = featureIds[0];
    let feature = features.find((f: any) => f.id === feature_id);

    let cusProducts = await CusService.getFullCusProducts({
      sb,
      internalCustomerId: customer.internal_id,
      withProduct: true,
      withPrices: true,
      inStatuses: getActiveCusProductStatuses(),
      logger,
    });

    // Fetch existing
    let existingEntities = await EntityService.get({
      sb,
      orgId,
      env,
      internalFeatureId: feature.internal_id,
      internalCustomerId: customer.internal_id,
    });


    console.log("existingEntities", existingEntities.map((e: any) => `${e.id} - ${e.name}, deleted: ${e.deleted}`));
    

    for (const entity of existingEntities) {
      if (inputEntities.some((e: any) => e.id === entity.id) && !entity.deleted) {
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
      
      // const originalBalance = cusEnt.balance - (replacedCount || 0) + (unused || 0);
      // const newBalance = cusEnt.balance - (newCount + replacedCount) + (unused || 0);
      const originalBalance = cusEnt.balance + (unused || 0);
      const newBalance = cusEnt.balance - (newCount + replacedCount) + (unused || 0);

      // console.log("originalBalance", originalBalance);
      // console.log("newBalance", newBalance);
      // console.log("Replaced count", replacedCount);
      // throw new Error("test");

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
    logger.info(`  Created / replaced entities!`);


    res.status(200).json({
      success: true,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "create entity" });
  }
};
