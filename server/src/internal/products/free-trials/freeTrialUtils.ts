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
import { addDays, addSeconds, getTime } from "date-fns";

export const validateFreeTrial = ({
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
    created_at: Date.now(),
    duration: FreeTrialDuration.Day,
    internal_product_id: internalProductId,
    is_custom: isCustom,
  };
};

export const freeTrialsAreSame = (ft1?: FreeTrial, ft2?: FreeTrial) => {
  if (!ft1 && !ft2) return true;
  if (!ft1 || !ft2) return false;
  return (
    ft1.length === ft2.length &&
    ft1.unique_fingerprint === ft2.unique_fingerprint
  );
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
    .select("*, customer:inner!(*)")
    .eq("free_trial_id", freeTrialId)
    .eq("customer.fingerprint", fingerprint);

  if (data && data.length > 0) {
    return true;
  }

  return false;
};

export const freeTrialToStripeTimestamp = (freeTrial: FreeTrial | null) => {
  if (!freeTrial) return undefined;
  // 1. Add days
  let trialEnd = addDays(new Date(), freeTrial.length);
  trialEnd = addSeconds(trialEnd, 10);

  return Math.ceil(trialEnd.getTime() / 1000);
};
