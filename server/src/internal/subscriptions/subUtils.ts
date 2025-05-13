import { generateId } from "@/utils/genUtils.js";
import { AppEnv, Subscription } from "@autumn/shared";

export const constructSub = ({
  stripeId,
  stripeScheduleId,
  usageFeatures,
  orgId,
  env,
  currentPeriodStart,
  currentPeriodEnd,
}: {
  stripeId?: string;
  stripeScheduleId?: string;
  usageFeatures: string[];
  orgId: string;
  env: AppEnv;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
}) => {
  let newSub: Subscription = {
    id: generateId("sub"),
    stripe_id: stripeId || null,
    stripe_schedule_id: stripeScheduleId || null,
    created_at: Date.now(),
    usage_features: usageFeatures,
    org_id: orgId,
    env: env,
    current_period_start: currentPeriodStart || null,
    current_period_end: currentPeriodEnd || null,
  };

  return newSub;
};
