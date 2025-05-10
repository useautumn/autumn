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
  ft1?: FreeTrial | null,
  ft2?: FreeTrial | null
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

  trialEnd = addMinutes(trialEnd, 1);

  return Math.ceil(trialEnd.getTime() / 1000);
};

export const freeTrialToNumDays = (freeTrial: FreeTrial | null) => {
  if (!freeTrial) return undefined;
  return freeTrial.length;
};

export const trialFingerprintExists = async ({
  sb,
  freeTrialId,
  fingerprint,
}: {
  sb: SupabaseClient;
  freeTrialId: string;
  fingerprint: string | null;
}) => {
  const { data, error } = await sb
    .from("customer_products")
    .select("*, customer:customers!inner(*)")
    .eq("free_trial_id", freeTrialId)
    .eq("customer.fingerprint", fingerprint);

  if (error) {
    throw error;
  }

  if (data && data.length > 0) {
    return true;
  }

  return false;
};

export const trialWithCustomerExists = async ({
  sb,
  internalCustomerId,
  freeTrialId,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  freeTrialId: string;
}) => {
  const { data, error } = await sb
    .from("customer_products")
    .select("*, customer:customers!inner(*)")
    .eq("internal_customer_id", internalCustomerId)
    .eq("free_trial_id", freeTrialId);

  if (error) {
    throw error;
  }

  if (data && data.length > 0) {
    return true;
  }

  return false;
};

export const getFreeTrialAfterFingerprint = async ({
  sb,
  freeTrial,
  fingerprint,
  internalCustomerId,
  multipleAllowed,
}: {
  sb: SupabaseClient;
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
      sb,
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
      sb,
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
  sb,
  newFreeTrial,
  curFreeTrial,
  internalProductId,
  isCustom = false,
}: {
  sb: SupabaseClient;
  newFreeTrial: FreeTrial | null;
  curFreeTrial: FreeTrial | null | undefined;
  internalProductId: string;
  isCustom: boolean;
}) => {
  // If new free trial is null
  if (!newFreeTrial) {
    // Delete if not custom and current free trial exists
    if (!isCustom && curFreeTrial) {
      await FreeTrialService.delete({
        sb,
        freeTrialId: curFreeTrial.id,
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
      sb,
      data: createdFreeTrial,
    });
  } else if (!isCustom) {
    createdFreeTrial.id = curFreeTrial?.id || createdFreeTrial.id;

    await FreeTrialService.upsert({
      sb,
      data: createdFreeTrial,
    });
  }

  return createdFreeTrial;
};
