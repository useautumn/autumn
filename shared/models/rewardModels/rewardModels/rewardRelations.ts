import { relations } from "drizzle-orm";
import { entitlements } from "../../productModels/entModels/entTable";
import { rewards } from "./rewardTable";

export const rewardRelations = relations(rewards, ({ many }) => ({
	entitlements: many(entitlements),
}));
