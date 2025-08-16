import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";
import {
  FullCustomerEntitlement,
  Price,
  FullCusProduct,
  UsagePriceConfig,
  EntInterval,
  Customer,
  APIVersion,
  RolloverConfig,
} from "@autumn/shared";
import { differenceInMinutes, subDays } from "date-fns";
import { submitUsageToStripe } from "../../stripeMeterUtils.js";
import { getInvoiceItemForUsage } from "../../stripePriceUtils.js";
import { getCusPriceUsage } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { findStripeItemForPrice } from "../../stripeSubUtils/stripeSubItemUtils.js";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import { notNullish } from "@/utils/genUtils.js";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";

export const handleUsagePrices = async ({
  db,
  invoice,
  customer,
  relatedCusEnt,
  stripeCli,
  price,
  usageSub,
  logger,
  activeProduct,
}: {
  db: DrizzleCli;
  invoice: Stripe.Invoice;
  customer: Customer;
  relatedCusEnt: FullCustomerEntitlement;
  stripeCli: Stripe;
  price: Price;
  usageSub: Stripe.Subscription;
  logger: any;
  activeProduct: FullCusProduct;
}) => {
  let invoiceCreatedRecently =
    Math.abs(
      differenceInMinutes(
        new Date(activeProduct.created_at),
        new Date(invoice.created * 1000)
      )
    ) < 10;

  let invoiceFromUpgrade = invoice.billing_reason == "subscription_update";

  if (invoiceCreatedRecently) {
    logger.info("Invoice created recently, skipping");
    return;
  }

  if (invoiceFromUpgrade) {
    logger.info("Invoice is from upgrade, skipping");
    return;
  }

  let config = price.config as UsagePriceConfig;

  // If relatedCusEnt's balance > 0 and next_reset_at is null, skip...
  if (relatedCusEnt.balance! > 0 && !relatedCusEnt.next_reset_at) {
    logger.info("Balance > 0 and next_reset_at is null, skipping");
    return;
  }

  const subItem = findStripeItemForPrice({
    price,
    stripeItems: usageSub.items.data,
  });

  const isNewUsageMethod =
    activeProduct.internal_entity_id ||
    activeProduct.api_version === APIVersion.v1_4;

  if (isNewUsageMethod) {
    let invoiceItem = getInvoiceItemForUsage({
      stripeInvoiceId: invoice.id!,
      price,
      customer,
      currency: invoice.currency,
      cusProduct: activeProduct,
      logger,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
    });

    if (invoiceItem.price_data!.unit_amount! > 0) {
      await stripeCli.invoiceItems.create(invoiceItem);
    }
  } else {
    if (!config.stripe_meter_id) {
      logger.warn(
        `Price ${price.id} has no stripe meter id, skipping invoice.created for usage in arrear`
      );
      return;
    }

    const { roundedUsage } = getCusPriceUsage({
      price,
      cusProduct: activeProduct,
      logger,
    });

    const usageTimestamp = Math.round(
      subDays(new Date(invoice.created * 1000), 1).getTime() / 1000
    );

    await submitUsageToStripe({
      price,
      stripeCli,
      usage: roundedUsage,
      customer,
      usageTimestamp,
      feature: relatedCusEnt.entitlement.feature,
      logger,
    });
  }

  if (relatedCusEnt.entitlement.interval == EntInterval.Lifetime) {
    return;
  }

  let ent = relatedCusEnt.entitlement;

  let resetBalancesUpdate = getResetBalancesUpdate({
    cusEnt: relatedCusEnt,
    allowance: ent.interval == EntInterval.Lifetime ? 0 : ent.allowance!,
  });

  const { end } = subToPeriodStartEnd({ sub: usageSub });
  await CusEntService.update({
    db,
    id: relatedCusEnt.id,
    updates: {
      ...resetBalancesUpdate,
      adjustment: 0,
      next_reset_at: relatedCusEnt.next_reset_at ? end * 1000 : null,
    },
  });

  let rolloverUpdate = getRolloverUpdates({
    cusEnt: relatedCusEnt,
    nextResetAt: end * 1000,
  });

  if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
    await RolloverService.insert({
      db,
      rows: rolloverUpdate.toInsert,
      fullCusEnt: relatedCusEnt,
    });
  }

  logger.info("✅ Successfully reset balance");
};
