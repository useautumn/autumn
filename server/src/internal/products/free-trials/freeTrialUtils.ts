import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import {
  CreateFreeTrial,
  CreateFreeTrialSchema,
  FreeTrial,
  FreeTrialDuration,
  FullProduct,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  addDays,
  addMinutes,
  addMonths,
  addSeconds,
  addWeeks,
  addYears,
  getTime,
} from "date-fns";
import { FreeTrialService } from "./FreeTrialService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

export const validateAndInitFreeTrial = ({
  freeTrial,
  internalProductId,
  isCustom = false,
}: {
  freeTrial: CreateFreeTrial;
  internalProductId: string;
  isCustom?: boolean;
}): FreeTrial => {
  const freeTrialSchema = CreateFreeTrialSchema.parse(freeTrial);

  return {
    ...freeTrialSchema,
    id: generateId("ft"),
    created_at: Date.now(),
    duration: freeTrial.duration || FreeTrialDuration.Day,
    internal_product_id: internalProductId,
    is_custom: isCustom,
  };
};

export const freeTrialsAreSame = (
  ft1?: FreeTrial | CreateFreeTrial | null,
  ft2?: FreeTrial | CreateFreeTrial | null,
) => {
  if (!ft1 && !ft2) return true;
  if (!ft1 || !ft2) return false;
  return (
    ft1.length === ft2.length &&
    ft1.unique_fingerprint === ft2.unique_fingerprint &&
    ft1.duration === ft2.duration
  );
};

export const freeTrialToStripeTimestamp = (freeTrial: FreeTrial | null) => {
  if (!freeTrial) return undefined;

  let duration = freeTrial.duration || FreeTrialDuration.Day;
  let length = freeTrial.length;

  let trialEnd: Date;
  if (duration === FreeTrialDuration.Day) {
    trialEnd = addDays(new Date(), length);
  } else if (duration === FreeTrialDuration.Month) {
    trialEnd = addMonths(new Date(), length);
  } else if (duration === FreeTrialDuration.Year) {
    trialEnd = addYears(new Date(), length);
  } else {
    throw new RecaseError({
      message: `Invalid free trial duration: ${duration}`,
      code: "invalid_free_trial_duration",
      statusCode: 400,
    });
  }

  trialEnd = addMinutes(trialEnd, 5);

  return Math.ceil(trialEnd.getTime() / 1000);
};

export const freeTrialToNumDays = (freeTrial: FreeTrial | null) => {
  if (!freeTrial) return undefined;
  return freeTrial.length;
};

export const trialFingerprintExists = async ({
  db,
  freeTrialId,
  fingerprint,
}: {
  db: DrizzleCli;
  freeTrialId: string;
  fingerprint: string;
}) => {
  const data = await CusProductService.getByFingerprint({
    db,
    freeTrialId,
    fingerprint,
  });

  if (data && data.length > 0) {
    return true;
  }

  return false;
};

export const trialWithCustomerExists = async ({
  db,
  internalCustomerId,
  freeTrialId,
}: {
  db: DrizzleCli;
  internalCustomerId: string;
  freeTrialId: string;
}) => {
  const data = await CusProductService.getByFingerprint({
    db,
    freeTrialId,
    fingerprint: internalCustomerId,
  });

  if (data && data.length > 0) {
    return true;
  }

  return false;
};

export const getFreeTrialAfterFingerprint = async ({
  db,
  freeTrial,
  fingerprint,
  internalCustomerId,
  multipleAllowed,
}: {
  db: DrizzleCli;
  freeTrial: FreeTrial | null | undefined;
  fingerprint: string | null | undefined;
  internalCustomerId: string;
  multipleAllowed: boolean;
}): Promise<FreeTrial | null> => {
  if (!freeTrial) return null;

  if (multipleAllowed) {
    return freeTrial;
  }

  let uniqueFreeTrial: FreeTrial | null = freeTrial;
  if (uniqueFreeTrial.unique_fingerprint && fingerprint) {
    let exists = await trialFingerprintExists({
      db,
      fingerprint,
      freeTrialId: uniqueFreeTrial.id,
    });

    if (exists) {
      console.log("Free trial fingerprint exists");
      uniqueFreeTrial = null;
    }
  }

  if (uniqueFreeTrial) {
    // Check if same customer exists
    let exists = await trialWithCustomerExists({
      db,
      internalCustomerId,
      freeTrialId: uniqueFreeTrial.id,
    });

    if (exists) {
      console.log("Free trial with customer exists");
      uniqueFreeTrial = null;
    }
  }

  return uniqueFreeTrial;
};

export const handleNewFreeTrial = async ({
  db,
  newFreeTrial,
  curFreeTrial,
  internalProductId,
  isCustom = false,
}: {
  db: DrizzleCli;
  newFreeTrial: CreateFreeTrial | null;
  curFreeTrial: FreeTrial | null | undefined;
  internalProductId: string;
  isCustom: boolean;
}) => {
  // If new free trial is null
  if (!newFreeTrial) {
    if (!isCustom && curFreeTrial) {
      await FreeTrialService.delete({
        db,
        id: curFreeTrial.id,
      });
    }
    return null;
  }

  if (freeTrialsAreSame(curFreeTrial, newFreeTrial)) {
    return curFreeTrial;
  }

  const createdFreeTrial = validateAndInitFreeTrial({
    freeTrial: newFreeTrial,
    internalProductId,
    isCustom,
  });

  if (isCustom && newFreeTrial) {
    await FreeTrialService.insert({
      db,
      data: createdFreeTrial,
    });
  } else if (!isCustom) {
    createdFreeTrial.id = curFreeTrial?.id || createdFreeTrial.id;

    await FreeTrialService.upsert({
      db,
      data: createdFreeTrial,
    });
  }

  return createdFreeTrial;
};
