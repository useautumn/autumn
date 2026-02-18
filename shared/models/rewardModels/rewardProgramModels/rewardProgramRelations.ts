import { relations } from "drizzle-orm";
import { rewards } from "../rewardModels/rewardTable";
import { rewardPrograms } from "./rewardProgramTable";

export const rewardProgramRelations = relations(rewardPrograms, ({ one }) => ({
	reward: one(rewards, {
		fields: [rewardPrograms.internal_reward_id],
		references: [rewards.internal_id],
	}),
}));
