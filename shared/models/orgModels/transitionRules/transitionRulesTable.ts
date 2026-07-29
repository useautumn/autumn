import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
	foreignKey,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../../db/utils.js";
import { organizations } from "../orgTable.js";
import type { TransitionRuleCarryOverUsages } from "./transitionRules.js";

export const transitionRules = pgTable(
	"transition_rules",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		carry_over_usages: jsonb().$type<TransitionRuleCarryOverUsages | null>(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		primaryKey({
			columns: [table.org_id, table.env],
			name: "transition_rules_pkey",
		}),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "transition_rules_org_id_fkey",
		}).onDelete("cascade"),
	],
);

export type TransitionRuleRow = InferSelectModel<typeof transitionRules>;
export type InsertTransitionRuleRow = InferInsertModel<typeof transitionRules>;
