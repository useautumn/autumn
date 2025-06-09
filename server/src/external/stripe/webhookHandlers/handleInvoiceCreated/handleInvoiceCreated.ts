import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

import {
  AppEnv,
  BillingType,
  CusProductStatus,
  Customer,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  LoggerAction,
  Organization,
} from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "../../utils.js";

import { getStripeSubs, getUsageBasedSub } from "../../stripeSubUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { notNullish } from "@/utils/genUtils.js";

import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { getFeatureName } from "@/internal/features/utils/displayUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getFullStripeInvoice } from "../../stripeInvoiceUtils.js";
import { handleUsagePrices } from "./handleUsagePrices.js";
import { handleContUsePrices } from "./handleContUsePrices.js";

const handleInArrearProrated = async ({
  db,
  cusEnts,
  cusPrice,
  customer,
  org,
  env,
  invoice,
  usageSub,
  logger,
}: {
  db: DrizzleCli;

  cusEnts: FullCustomerEntitlement[];
  cusPrice: FullCustomerPrice;
  customer: Customer;
  org: Organization;
  env: AppEnv;
  invoice: Stripe.Invoice;
  usageSub: Stripe.Subscription;
  logger: any;
}) => {
  const cusEnt = getRelatedCusEnt({
    cusPrice,
    cusEnts,
  });

  if (!cusEnt) {
    console.log("No related cus ent found");
    return;
  }

  // console.log("Invoice period start:\t", formatUnixToDateTime(invoice.period_start * 1000));
  // console.log("Invoice period end:\t", formatUnixToDateTime(invoice.period_end * 1000));
  // console.log("Sub period start:\t", formatUnixToDateTime(usageSub.current_period_start * 1000));
  // console.log("Sub period end:\t", formatUnixToDateTime(usageSub.current_period_end * 1000));

  // Check if invoice is for new subscription period by comparing billing period
  const isNewPeriod = invoice.period_start !== usageSub.current_period_start;
  if (!isNewPeriod) {
    logger.info("Invoice is not for new subscription period, skipping...");
    return;
  }

  let feature = cusEnt.entitlement.feature;
  logger.info(
    `Handling invoice.created for in arrear prorated, feature: ${feature.id}`,
  );

  let deletedEntities = await EntityService.list({
    db,
    internalCustomerId: customer.internal_id!,
    inFeatureIds: [feature.internal_id!],
    isDeleted: true,
  });

  if (deletedEntities.length == 0) {
    logger.info("No deleted entities found");
    return;
  }

  logger.info(
    `✨ Handling in arrear prorated, customer ${customer.name}, org: ${org.slug}`,
  );

  logger.info(
    `Deleting entities, feature ${feature.id}, customer ${customer.id}, org ${org.slug}`,
    deletedEntities,
  );

  // Get linked cus ents

  for (const linkedCusEnt of cusEnts) {
    // isLinked
    let isLinked = linkedCusEnt.entitlement.entity_feature_id == feature.id;

    if (!isLinked) {
      continue;
    }

    logger.info(
      `Linked cus ent: ${linkedCusEnt.feature_id}, isLinked: ${isLinked}`,
    );

    // Delete cus ent ids
    let newEntities = structuredClone(linkedCusEnt.entities!);
    for (const entityId in newEntities) {
      if (deletedEntities.some((e) => e.id == entityId)) {
        delete newEntities[entityId];
      }
    }

    console.log("New entities: ", newEntities);
    console.log("Cus ent ID: ", linkedCusEnt.id);

    let updated = await CusEntService.update({
      db,
      id: linkedCusEnt.id,
      updates: {
        entities: newEntities,
      },
    });
    console.log(`Updated ${updated.length} cus ents`);

    logger.info(
      `Feature: ${feature.id}, customer: ${customer.id}, deleted entities from cus ent`,
    );
    linkedCusEnt.entities = newEntities;
  }

  await EntityService.deleteInInternalIds({
    db,
    internalIds: deletedEntities.map((e) => e.internal_id!),
    orgId: org.id,
    env,
  });
  logger.info(
    `Feature: ${feature.id}, Deleted ${
      deletedEntities.length
    }, entities: ${deletedEntities.map((e) => `${e.id}`).join(", ")}`,
  );

  // Increase balance
  if (notNullish(cusEnt.balance)) {
    logger.info(`Incrementing balance for cus ent: ${cusEnt.id}`);
    await CusEntService.increment({
      db,
      id: cusEnt.id,
      amount: deletedEntities.length,
    });
  }
};

// For cancel at period end: invoice period start = sub period start (cur cycle), invoice period end = sub period end (a month later...)
// For cancel immediately: invoice period start = sub period start (cur cycle), invoice period end cancel immediately date
// For regular billing: invoice period end = sub period start (next cycle)
// For upgrade, bill_immediately: invoice period start = sub period start (cur cycle), invoice period end cancel immediately date

export const sendUsageAndReset = async ({
  db,
  activeProduct,
  org,
  env,
  invoice,
  stripeSubs,
  logger,
}: {
  db: DrizzleCli;
  activeProduct: FullCusProduct;
  org: Organization;
  env: AppEnv;
  invoice: Stripe.Invoice;
  stripeSubs: Stripe.Subscription[];
  logger: any;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const cusEnts = activeProduct.customer_entitlements;
  const cusPrices = activeProduct.customer_prices;
  const customer = activeProduct.customer!;

  for (const cusPrice of cusPrices) {
    const price = cusPrice.price;
    let billingType = getBillingType(price.config);

    if (
      billingType !== BillingType.UsageInArrear &&
      billingType !== BillingType.InArrearProrated
    ) {
      continue;
    }

    let relatedCusEnt = getRelatedCusEnt({
      cusPrice,
      cusEnts,
    });

    if (!relatedCusEnt) {
      continue;
    }

    let usageBasedSub = await getUsageBasedSub({
      db,
      stripeCli,
      subIds: activeProduct.subscription_ids || [],
      feature: relatedCusEnt.entitlement.feature,
      stripeSubs,
    });

    if (!usageBasedSub || usageBasedSub.id != invoice.subscription) {
      continue;
    }

    // If trial just ended, skip
    if (usageBasedSub.trial_end == usageBasedSub.current_period_start) {
      logger.info(`Trial just ended, skipping usage invoice.created`);
      continue;
    }

    if (billingType == BillingType.UsageInArrear) {
      logger.info(
        `✨ Handling usage prices for ${customer.name}, org: ${org.slug}`,
      );

      await handleUsagePrices({
        db,
        invoice,
        customer,
        relatedCusEnt,
        stripeCli,
        price,
        usageSub: usageBasedSub,
        logger,
        activeProduct,
      });
    }

    if (billingType == BillingType.InArrearProrated) {
      await handleContUsePrices({
        db,
        stripeCli,
        cusEnts,
        cusPrice,
        // customer,
        // org,
        // env,
        invoice,
        usageSub: usageBasedSub,
        logger,
      });
      // await handleInArrearProrated({
      //   db,
      //   cusEnts,
      //   cusPrice,
      //   customer,
      //   org,
      //   env,
      //   invoice,
      //   usageSub: usageBasedSub,
      //   logger,
      // });
    }
  }
};

export const handleInvoiceCreated = async ({
  db,
  org,
  data,
  env,
}: {
  db: DrizzleCli;
  org: Organization;
  data: Stripe.Invoice;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({ org, env });
  const invoice = await getFullStripeInvoice({
    stripeCli,
    stripeId: data.id,
  });

  const logger = createLogtailWithContext({
    org: org,
    invoice: invoice,
    action: LoggerAction.StripeWebhookInvoiceCreated,
  });

  if (invoice.subscription) {
    const activeProducts = await CusProductService.getByStripeSubId({
      db,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.Expired,
        CusProductStatus.PastDue,
      ],
    });

    if (activeProducts.length == 0) {
      logger.warn(
        `Stripe invoice.created -- no active products found (${org.slug})`,
      );
      return;
    }

    let internalEntityId = activeProducts.find(
      (p) => p.internal_entity_id,
    )?.internal_entity_id;

    let features = await FeatureService.list({
      db,
      orgId: org.id,
      env,
    });

    if (internalEntityId) {
      try {
        let stripeCli = createStripeCli({ org, env });
        let entity = await EntityService.getByInternalId({
          db,
          internalId: internalEntityId,
          orgId: org.id,
          env,
        });

        let feature = features.find(
          (f) => f.internal_id == entity?.internal_feature_id,
        );

        let entDetails = "";
        if (entity.name) {
          entDetails = `${entity.name}${
            entity.id ? ` (ID: ${entity.id})` : ""
          }`;
        } else if (entity.id) {
          entDetails = `${entity.id}`;
        }

        if (entDetails && feature) {
          await stripeCli.invoices.update(invoice.id, {
            description: `${getFeatureName({
              feature,
              plural: false,
              capitalize: true,
            })}: ${entity?.name} (ID: ${entity?.id})`,
          });
        }
      } catch (error: any) {
        if (
          error.message != "Finalized invoices can't be updated in this way"
        ) {
          logger.error(`Failed to add entity ID to invoice description`, error);
        }
      }
    }

    const stripeSubs = await getStripeSubs({
      stripeCli: createStripeCli({ org, env }),
      subIds: activeProducts.map((p) => p.subscription_ids || []).flat(),
    });

    for (const activeProduct of activeProducts) {
      await sendUsageAndReset({
        db,
        activeProduct,
        org,
        env,
        stripeSubs,
        invoice,
        logger,
      });
    }
  }
};
