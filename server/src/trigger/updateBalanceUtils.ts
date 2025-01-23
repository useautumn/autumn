import { Feature } from "@autumn/shared";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { Customer, FeatureType } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

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

  cusEnts.sort((a, b) => {
    if (a.balance <= 0) return 1;
    if (b.balance <= 0) return -1;

    return a.created_at - b.created_at;
  });

  return cusEnts;
};

const getCreditSystemDeduction = (
  meteredFeatures: Feature[],
  creditSystem: Feature
) => {
  let creditsUpdate = 0;
  let meteredFeatureIds = meteredFeatures.map((feature) => feature.id);

  for (const schema of creditSystem.config.schema) {
    if (meteredFeatureIds.includes(schema.metered_feature_id)) {
      creditsUpdate += (1 / schema.feature_amount) * schema.credit_amount;
    }
  }

  return creditsUpdate;
};

export const updateCustomerBalance = async ({
  sb,
  customer,
  features,
}: {
  sb: SupabaseClient;
  customer: Customer;
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

    const feature = features.find(
      (feature) => feature.internal_id === internalFeatureId
    );

    if (feature?.type === FeatureType.Metered) {
      featureIdToDeduction[internalFeatureId] = {
        cusEntId: cusEnt.id,
        deduction: 1,
        feature: feature,
      };
    }

    if (feature?.type === FeatureType.CreditSystem) {
      const deduction = getCreditSystemDeduction(meteredFeatures, feature);
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

    const { error } = await sb
      .from("customer_entitlements")
      .update({ balance: curBalance - deduction })
      .eq("id", cusEnt.id);

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
