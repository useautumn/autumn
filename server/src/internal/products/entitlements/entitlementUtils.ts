import RecaseError from "@/utils/errorUtils.js";
import { generateId, notNullOrUndefined } from "@/utils/genUtils.js";
import {
  EntInterval,
  FreeTrial,
  Entitlement,
  AllowanceType,
  EntitlementWithFeature,
  FeatureType,
  CreateEntitlement,
  CreateEntitlementSchema,
  Feature,
  ErrCode,
  EntitlementSchema,
  UsagePriceConfig,
  PriceType,
  Price,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "date-fns";
import { EntitlementService } from "./EntitlementService.js";

export const entIntervalToTrialDuration = (interval: EntInterval) => {
  switch (interval) {
    case EntInterval.Day:
      return 1;
    case EntInterval.Week:
      return 7;
    case EntInterval.Month:
      return 30;
    case EntInterval.Quarter:
      return 90;
    case EntInterval.SemiAnnual:
      return 180;
    case EntInterval.Year:
      return 365;
    case EntInterval.Lifetime:
      return 1000;
  }
};

export const applyTrialToEntitlement = (
  entitlement: EntitlementWithFeature,
  freeTrial: FreeTrial | null
) => {
  if (!freeTrial) return false;

  if (entitlement.feature.type === FeatureType.Boolean) return false;
  if (!entitlement.interval || entitlement.interval === EntInterval.Lifetime)
    return false;
  if (entitlement.allowance_type === AllowanceType.Unlimited) return false;

  const trialDays = freeTrial.length;
  const entDays = entIntervalToTrialDuration(entitlement.interval!);

  if (entDays && entDays > trialDays) {
    return true;
  }

  return false;
};

export const addTrialToNextResetAt = (
  nextResetAt: number,
  freeTrial: FreeTrial | null
) => {
  if (!freeTrial) return nextResetAt;

  return addDays(new Date(nextResetAt), freeTrial.length).getTime();
};

// HANDLING NEW ENTITLEMENTS

export const entsAreSame = (ent1: Entitlement, ent2: Entitlement) => {
  return (
    ent1.internal_feature_id === ent2.internal_feature_id &&
    ent1.interval === ent2.interval &&
    ent1.allowance_type === ent2.allowance_type &&
    ent1.allowance === ent2.allowance
  );
};

export const validateEntitlement = ({
  ent,
  features,
}: {
  ent: CreateEntitlement | Entitlement;
  features: Feature[];
}) => {
  const parsedEnt = CreateEntitlementSchema.parse(ent);

  // 1. Check if feature exists
  const feature = features.find((f) => f.id === parsedEnt.feature_id);
  if (!feature) {
    throw new RecaseError({
      message: `Feature ${parsedEnt.feature_id} not found`,
      code: ErrCode.FeatureNotFound,
      statusCode: 400,
    });
  }

  // 2. If feature is boolean, return
  if (feature.type === FeatureType.Boolean) {
    return;
  }

  if (!parsedEnt.allowance_type) {
    throw new RecaseError({
      code: ErrCode.InvalidEntitlement,
      message: `Allowance type is required for feature ${parsedEnt.feature_id}`,
      statusCode: 400,
    });
  }

  if (parsedEnt.allowance_type == AllowanceType.Fixed) {
    if (!notNullOrUndefined(parsedEnt.allowance) || parsedEnt.allowance! < 0) {
      throw new RecaseError({
        code: ErrCode.InvalidEntitlement,
        message: `Allowance is required for feature ${parsedEnt.feature_id}`,
        statusCode: 400,
      });
    }

    if (!parsedEnt.interval) {
      throw new RecaseError({
        code: ErrCode.InvalidEntitlement,
        message: `Interval is required for feature ${parsedEnt.feature_id}`,
        statusCode: 400,
      });
    }
  }
};

export const initEntitlement = ({
  ent,
  features,
  orgId,
  isCustom = false,
  internalProductId,
}: {
  ent: CreateEntitlement;
  features: Feature[];
  orgId: string;
  isCustom?: boolean;
  internalProductId?: string;
}) => {
  const parsedEnt = CreateEntitlementSchema.parse(ent);

  const feature = features.find((f) => f.id === parsedEnt.feature_id);
  const newEnt: Entitlement = {
    ...parsedEnt,

    id: generateId("ent"),
    is_custom: isCustom,
    org_id: orgId,
    created_at: Date.now(),
    internal_product_id: internalProductId,
  };

  if (feature?.type === FeatureType.Boolean) {
    newEnt.allowance = null;
    newEnt.allowance_type = null;
    newEnt.interval = null;
  }

  return newEnt;
};

export const handleNewEntitlements = async ({
  sb,
  newEnts,
  curEnts,
  features,
  orgId,
  internalProductId,
  isCustom = false,
}: {
  sb: SupabaseClient;
  newEnts: Entitlement[] | CreateEntitlement[];
  curEnts: Entitlement[];
  features: Feature[];
  internalProductId: string;
  orgId: string;
  isCustom: boolean;
}) => {
  // Add internal_feature_id to newEnts
  for (const ent of newEnts) {
    const feature = features.find((f) => f.id === ent.feature_id);
    if (feature) {
      ent.internal_feature_id = feature.internal_id;
    }
  }

  const idToEnt: { [key: string]: Entitlement } = {};
  for (const ent of curEnts) {
    idToEnt[ent.id!] = ent;
  }

  // 1. Deleted entitlements: filter out entitlements that are not in newEnts
  const removedEnts: Entitlement[] = curEnts.filter(
    (ent) => !newEnts.some((e: Entitlement) => e.id === ent.id)
  );

  const createdEnts: Entitlement[] = [];
  const updatedEnts: Entitlement[] = [];

  for (let newEnt of newEnts) {
    // Validate entitlement
    validateEntitlement({ ent: newEnt, features });

    // 1. Handle new entitlement
    if (!("id" in newEnt)) {
      createdEnts.push(
        initEntitlement({
          ent: newEnt as CreateEntitlement,
          features,
          orgId,
          internalProductId,
          isCustom,
        })
      );
    }

    // 2. Handle updated entitlement
    newEnt = newEnt as Entitlement;
    let curEnt = idToEnt[newEnt.id!];

    // 2a. If custom, create new entitlement and remove old one
    if (curEnt && !entsAreSame(curEnt, newEnt) && isCustom) {
      createdEnts.push(
        initEntitlement({
          ent: CreateEntitlementSchema.parse(newEnt),
          features,
          orgId,
          internalProductId,
          isCustom,
        })
      );
      removedEnts.push(curEnt);
    }

    // 2b. If not customm, update existing entitlement
    if (curEnt && !entsAreSame(curEnt, newEnt) && !isCustom) {
      updatedEnts.push(EntitlementSchema.parse(newEnt));
    }
  }

  // 1. Create new entitlements
  await EntitlementService.insert({ sb, data: createdEnts });

  // 2. Update existing entitlements and delete removed ones
  if (!isCustom) {
    await EntitlementService.upsert({ sb, data: updatedEnts });

    await EntitlementService.deleteByIds({
      sb,
      entitlementIds: removedEnts.map((e) => e.id!),
    });
  }

  if (isCustom) {
    return [
      ...createdEnts,
      ...curEnts.filter((e) => !removedEnts.some((re) => re.id === e.id)),
    ];
  }

  console.log(
    `Successfully handled new entitlements. Created ${createdEnts.length}, updated ${updatedEnts.length}, removed ${removedEnts.length}`
  );
};

// OTHERS
export const getEntRelatedPrice = (
  entitlement: Entitlement,
  prices: Price[]
) => {
  return prices.find((price) => {
    if (price.config?.type === PriceType.Fixed) {
      return false;
    }

    const config = price.config as UsagePriceConfig;
    return config.internal_feature_id === entitlement.internal_feature_id;
  });
};
