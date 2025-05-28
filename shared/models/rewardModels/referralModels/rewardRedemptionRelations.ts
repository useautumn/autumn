import { relations } from "drizzle-orm";
import { rewardRedemptions } from "./rewardRedemptionTable.js";
import { customers } from "../../cusModels/cusTable.js";
import { referralCodes } from "./referralCodeTable.js";
import { rewardPrograms } from "../rewardProgramModels/rewardProgramTable.js";

export const rewardRedemptionRelations = relations(
  rewardRedemptions,
  ({ one }) => ({
    customer: one(customers, {
      fields: [rewardRedemptions.internal_customer_id],
      references: [customers.internal_id],
    }),

    referral_code: one(referralCodes, {
      fields: [rewardRedemptions.referral_code_id],
      references: [referralCodes.id],
    }),

    reward_program: one(rewardPrograms, {
      fields: [rewardRedemptions.internal_reward_program_id],
      references: [rewardPrograms.internal_id],
    }),
  }),
);
