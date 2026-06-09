import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { foreignKey, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { sqlNow } from "../../../db/utils.js";
import { organizations } from "../orgTable.js";
import type { CreditRules, EntityRules } from "./agentRules.js";

export type AgentRulesMetadata = Record<string, unknown>;

export const agentRules = pgTable(
	"agent_rules",
	{
		org_id: text("org_id").primaryKey().notNull(),
		org_slug: text("org_slug").notNull(),
		entity_rules: jsonb().$type<EntityRules>().notNull(),
		credit_rules: jsonb().$type<CreditRules>().notNull(),
		notes: text().notNull().default(""),
		metadata: jsonb().$type<AgentRulesMetadata>().notNull().default({}),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "agent_rules_org_id_fkey",
		}).onDelete("cascade"),
	],
);

export type AgentRulesRow = InferSelectModel<typeof agentRules>;
export type InsertAgentRulesRow = InferInsertModel<typeof agentRules>;
