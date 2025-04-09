import { generateId } from "@/utils/genUtils.js";
import { CreateRewardProgram, RewardProgram } from "@autumn/shared";

export const constructRewardProgram = ({
  rewardProgramData,
  orgId,
  env,
}: {
  rewardProgramData: CreateRewardProgram;
  orgId: string;
  env: string;
}) => {
  let rewardProgram: RewardProgram = {
    ...rewardProgramData,
    internal_id: generateId("rs"),
    unlimited_redemptions: false,
    created_at: Date.now(),
    org_id: orgId,
    env,
  };

  return rewardProgram;
};
