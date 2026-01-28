import {
	foreignKey,
	numeric,
	pgTable,
	primaryKey,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { customers } from "../../cusModels/cusTable.js";
import { organizations } from "../../orgModels/orgTable.js";
import { rewardPrograms } from "../rewardProgramModels/rewardProgramTable.js";

export const referralCodes = pgTable(
	"referral_codes",
	{
		code: text().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		internal_customer_id: text("internal_customer_id"),
		internal_reward_program_id: text("internal_reward_program_id"),
		id: text().notNull(),
		created_at: numeric({ mode: "number" }),
	},

	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "referral_codes_internal_customer_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_reward_program_id],
			foreignColumns: [rewardPrograms.internal_id],
			name: "referral_codes_internal_reward_program_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "referral_codes_org_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.code, table.org_id, table.env],
			name: "referral_codes_pkey",
		}),
		unique("referral_codes_id_key").on(table.id),
	],
);
