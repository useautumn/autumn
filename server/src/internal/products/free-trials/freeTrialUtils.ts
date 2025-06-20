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

export const freeTrialsAreSame = ({
  ft1,
  ft2,
}: {
  ft1?: FreeTrial | CreateFreeTrial | null;
  ft2?: FreeTrial | CreateFreeTrial | null;
}) => {
  if (!ft1 && !ft2) return true;
  if (!ft1 || !ft2) return false;
  return (
    ft1.length === ft2.length &&
    ft1.unique_fingerprint === ft2.unique_fingerprint &&
    ft1.duration === ft2.duration
  );
};

export const freeTrialToStripeTimestamp = ({
  freeTrial,
  now,
}: {
  freeTrial: FreeTrial | null | undefined;
  now?: number | undefined;
}) => {
  now = now || Date.now();

  if (!freeTrial) return undefined;

  let duration = freeTrial.duration || FreeTrialDuration.Day;
  let length = freeTrial.length;

  let trialEnd: Date;
  if (duration === FreeTrialDuration.Day) {
    trialEnd = addDays(new Date(now), length);
  } else if (duration === FreeTrialDuration.Month) {
    trialEnd = addMonths(new Date(now), length);
  } else if (duration === FreeTrialDuration.Year) {
    trialEnd = addYears(new Date(now), length);
  } else {
    throw new RecaseError({
      message: `Invalid free trial duration: ${duration}`,
      code: "invalid_free_trial_duration",
      statusCode: 400,
    });
  }

  // trialEnd = addMinutes(trialEnd, 5);
  trialEnd = addMinutes(trialEnd, 10);

  return Math.ceil(trialEnd.getTime() / 1000);
};

export const getFreeTrialAfterFingerprint = async ({
  db,
  freeTrial,
  productId,
  fingerprint,
  internalCustomerId,
  multipleAllowed,
}: {
  db: DrizzleCli;
  freeTrial: FreeTrial | null | undefined;
  productId: string;
  fingerprint: string | null | undefined;
  internalCustomerId: string;
  multipleAllowed: boolean;
}): Promise<FreeTrial | null> => {
  if (!freeTrial) return null;

  if (multipleAllowed) {
    return freeTrial;
  }

  let uniqueFreeTrial: FreeTrial | null = freeTrial;

  const data = await CusProductService.getByFingerprint({
    db,
    productId,
    internalCustomerId,
    fingerprint: uniqueFreeTrial.unique_fingerprint ? fingerprint! : undefined,
  });

  const exists = data && data.length > 0;

  if (exists) {
    console.log("Free trial fingerprint exists");
    uniqueFreeTrial = null;
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

  if (freeTrialsAreSame({ ft1: curFreeTrial, ft2: newFreeTrial })) {
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
