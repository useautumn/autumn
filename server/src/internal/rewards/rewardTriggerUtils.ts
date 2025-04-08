import { generateId } from "@/utils/genUtils.js";
import { CreateRewardTrigger, RewardTrigger } from "@autumn/shared";

export const constructRewardTrigger = ({
  rewardTriggerData,
  orgId,
  env,
}: {
  rewardTriggerData: CreateRewardTrigger;
  orgId: string;
  env: string;
}) => {
  let rewardTrigger: RewardTrigger = {
    ...rewardTriggerData,
    internal_id: generateId("rt"),
    unlimited_redemptions: false,
    created_at: Date.now(),
    org_id: orgId,
    env,
  };

  return rewardTrigger;
};
