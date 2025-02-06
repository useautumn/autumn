import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { handleBelowThresholdInvoicing } from "./invoiceThresholdUtils.js";
import { getBelowThresholdPrice } from "./invoiceThresholdUtils.js";

import { AggregateType, AllowanceType, Event, Feature } from "@autumn/shared";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { Customer, FeatureType } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { SbChannelEvent } from "@/websockets/initWs.js";
import chalk from "chalk";
import { sortCusEntsForDeduction } from "@/internal/customers/entitlements/cusEntUtils.js";

// 3. Get customer entitlements and sort
const getCustomerEntitlements = async ({
  sb,
  internalCustomerId,
  features,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  features: Feature[];
}) => {
  const internalFeatureIds = features.map((feature) => feature.internal_id);
  const cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
    sb,
    internalCustomerId,
    internalFeatureIds: internalFeatureIds as string[],
  });

  sortCusEntsForDeduction(cusEnts);

  return cusEnts;
};

// 2. Functions to get deduction per feature
export const getMeteredDeduction = (meteredFeature: Feature, event: Event) => {
  let config = meteredFeature.config;
  let aggregate = config.aggregate;

  if (aggregate.type == AggregateType.Count) {
    return 1;
  }

  if (aggregate.type == AggregateType.Sum) {
    let property = aggregate.property;
    let value = event.properties[property] || 0;

    let floatVal = parseFloat(value);
    if (isNaN(floatVal)) {
      return 0;
    }

    return floatVal;
  }

  return 0;
};

const getCreditSystemDeduction = ({
  meteredFeatures,
  creditSystem,
  event,
}: {
  meteredFeatures: Feature[];
  creditSystem: Feature;
  event: Event;
}) => {
  let creditsUpdate = 0;
  let meteredFeatureIds = meteredFeatures.map((feature) => feature.id);

  for (const schema of creditSystem.config.schema) {
    if (meteredFeatureIds.includes(schema.metered_feature_id)) {
      let meteredFeature = meteredFeatures.find(
        (feature) => feature.id === schema.metered_feature_id
      );

      if (!meteredFeature) {
        continue;
      }

      let meteredDeduction = getMeteredDeduction(meteredFeature, event);
      creditsUpdate +=
        (meteredDeduction / schema.feature_amount) * schema.credit_amount;
    }
  }

  return creditsUpdate;
};

// 1. Main function to update customer balance
export const updateCustomerBalance = async ({
  sb,
  customer,
  event,
  features,
}: {
  sb: SupabaseClient;
  customer: Customer;
  event: Event;
  features: Feature[];
}) => {
  const cusEnts = await getCustomerEntitlements({
    sb,
    internalCustomerId: customer.internal_id,
    features,
  });

  if (cusEnts.length === 0 || features.length === 0) {
    return;
  }

  const channel = sb.channel(
    `${customer.org_id}_${customer.env}_${customer.id}`
  );

  // Update customer balance
  const featureIdToDeduction: any = {};
  const meteredFeatures = features.filter(
    (feature) => feature.type === FeatureType.Metered
  );

  console.log(`   - Customer: ${customer.name} (${customer.internal_id})`);
  console.log(`   - Features: ${features.map((f) => f.id).join(", ")}`);

  for (const cusEnt of cusEnts) {
    const internalFeatureId = cusEnt.internal_feature_id;
    if (featureIdToDeduction[internalFeatureId]) {
      continue;
    }

    const feature = cusEnt.entitlement.feature;

    // 1. Skip if customer has unlimited entitlement
    let unlimitedExists = false;
    for (const cusEnt of cusEnts) {
      if (cusEnt.entitlement.allowance_type == AllowanceType.Unlimited) {
        unlimitedExists = true;
        break;
      }
    }

    if (unlimitedExists) {
      continue;
    }

    // 2. Get metered feature deduction
    if (feature.type === FeatureType.Metered) {
      let deduction = getMeteredDeduction(feature, event);

      featureIdToDeduction[internalFeatureId] = {
        cusEntId: cusEnt.id,
        deduction,
        feature: feature,
      };
    }

    // 3. Get credit system deduction
    if (feature.type === FeatureType.CreditSystem) {
      const deduction = getCreditSystemDeduction({
        meteredFeatures,
        creditSystem: feature,
        event,
      });

      if (deduction) {
        featureIdToDeduction[internalFeatureId] = {
          cusEntId: cusEnt.id,
          deduction: deduction,
          feature: feature,
        };
      }
    }

    let deduction = featureIdToDeduction[internalFeatureId]?.deduction;
    let curBalance = cusEnt.balance!;

    if (curBalance === undefined || curBalance === null) {
      continue;
    }

    // 3. Update customer balance
    const { error } = await sb
      .from("customer_entitlements")
      .update({ balance: curBalance - deduction })
      .eq("id", cusEnt.id);

    // Send balance updated event to channel

    // console.log(
    //   `   - Sending balance update event. Feature ${chalk.yellow(
    //     feature.id
    //   )}, Balance ${chalk.yellow(
    //     curBalance - deduction
    //   )}, Customer ${chalk.yellow(customer.id)}`
    // );

    // await channel.send({
    //   type: "broadcast",
    //   event: SbChannelEvent.BalanceUpdated,
    //   payload: {
    //     feature_id: feature.id,
    //     balance: curBalance - deduction,
    //   },
    // });

    if (error) {
      console.error(
        `   ❌ Failed to update (${feature?.id}: ${deduction}). Error: ${error}`
      );
    }
  }

  let featuresUpdated = Object.values(featureIdToDeduction).map(
    (obj: any) => `(${obj.feature.id}: ${obj.deduction})`
  );

  console.log(`   - Deducted ${featuresUpdated}`);
  return cusEnts;
};

export const runUpdateBalanceTask = async (payload: any) => {
  try {
    const sb = createSupabaseClient();

    // 1. Update customer balance
    const { customer, features, event } = payload;

    console.log("--------------------------------");
    console.log("Inside updateBalanceTask...");

    console.log("1. Updating customer balance...");
    const cusEnts: any = await updateCustomerBalance({
      sb,
      customer,
      features,
      event,
    });

    if (!cusEnts || cusEnts.length === 0) {
      console.log("✅ No customer entitlements found, skipping");
      return;
    }
    console.log("   ✅ Customer balance updated");

    // 2. Check if there's below threshold price
    const belowThresholdPrice = await getBelowThresholdPrice({
      sb,
      internalCustomerId: customer.internal_id,
      cusEnts,
    });

    if (belowThresholdPrice) {
      console.log("2. Below threshold price found");

      // await new Promise((resolve) => setTimeout(resolve, 1000));

      await handleBelowThresholdInvoicing({
        sb,
        internalCustomerId: payload.internalCustomerId,
        belowThresholdPrice,
      });
    } else {
      console.log("   ✅ No below threshold price found");
    }
  } catch (error) {
    console.log(`Error updating customer balance: ${error}`);
    console.log(error);
  }
};
