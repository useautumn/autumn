import { relations } from "drizzle-orm";
import { referralCodes } from "./referralCodeTable.js";
import { customers } from "../../cusModels/cusTable.js";
import { rewardPrograms } from "../rewardProgramModels/rewardProgramTable.js";
import { rewardRedemptions } from "./rewardRedemptionTable.js";

export const referralCodeRelations = relations(
  referralCodes,
  ({ many, one }) => ({
    reward_program: one(rewardPrograms, {
      fields: [referralCodes.internal_reward_program_id],
      references: [rewardPrograms.internal_id],
    }),
    customer: one(customers, {
      fields: [referralCodes.internal_customer_id],
      references: [customers.internal_id],
    }),

    reward_redemptions: many(rewardRedemptions),
  }),
);
