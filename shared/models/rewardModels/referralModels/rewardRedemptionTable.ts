import {
	boolean,
	foreignKey,
	index,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../../db/utils.js";
import { customers } from "../../cusModels/cusTable";
import { rewardPrograms } from "../rewardProgramModels/rewardProgramTable";
import { referralCodes } from "./referralCodeTable";

export const rewardRedemptions = pgTable(
	"reward_redemptions",
	{
		id: text().primaryKey().notNull(),
		created_at: numeric({ mode: "number" }),
		updated_at: numeric({ mode: "number" }),
		internal_customer_id: text("internal_customer_id"),
		triggered: boolean(),
		internal_reward_program_id: text("internal_reward_program_id"),
		applied: boolean().default(false),
		redeemer_applied: boolean().default(false),
		referral_code_id: text("referral_code_id"),
		reward_internal_id: text("reward_internal_id"),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "reward_redemptions_internal_customer_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_reward_program_id],
			foreignColumns: [rewardPrograms.internal_id],
			name: "reward_redemptions_internal_reward_program_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.referral_code_id],
			foreignColumns: [referralCodes.id],
			name: "reward_redemptions_referral_code_id_fkey",
		}).onDelete("cascade"),
		index("idx_reward_redemptions_referral_code_id").on(table.referral_code_id),
		// For counting promo code redemptions per reward (limit enforcement)
		index("idx_reward_redemptions_reward_internal_id").on(
			table.reward_internal_id,
		),
		// For checking if a customer already redeemed a specific reward
		index("idx_reward_redemptions_customer_reward").on(
			table.internal_customer_id,
			table.reward_internal_id,
		),
	],
);

collatePgColumn(rewardRedemptions.internal_customer_id, "C");
