import { relations } from "drizzle-orm";
import { rewardPrograms } from "./rewardProgramTable.js";
import { rewards } from "../rewardModels/rewardTable.js";

export const rewardProgramRelations = relations(rewardPrograms, ({ one }) => ({
	reward: one(rewards, {
		fields: [rewardPrograms.internal_reward_id],
		references: [rewards.internal_id],
	}),
}));
