import {
	foreignKey,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ActionType, AuthType } from "./actionEnums.js";
import { organizations } from "../orgModels/orgTable.js";
import { customers } from "../cusModels/cusTable.js";
import { entities } from "../cusModels/entityModels/entityTable.js";
import { collatePgColumn } from "../../db/utils.js";

export const actions = pgTable(
	"actions",
	{
		id: text().primaryKey().notNull(),

		request_id: text("request_id").notNull(),

		org_id: text("org_id").notNull(),
		org_slug: text("org_slug").notNull(),
		env: text().notNull(),

		customer_id: text("customer_id"),
		internal_customer_id: text("internal_customer_id"),

		entity_id: text("entity_id"),
		internal_entity_id: text("internal_entity_id"),

		type: text("type").$type<ActionType>().notNull(),
		auth_type: text("auth_type").$type<AuthType>().notNull(),

		method: text("method").notNull(),
		path: text("path").notNull(),

		timestamp: timestamp({ withTimezone: true }).notNull().default(sql`now()`),

		properties: jsonb("properties"),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "actions_org_id_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "actions_customer_id_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.internal_entity_id],
			foreignColumns: [entities.internal_id],
			name: "actions_entity_id_fkey",
		}).onDelete("set null"),
	],
).enableRLS();

collatePgColumn(actions.id, "C");

export type Action = typeof actions.$inferSelect;
export type ActionInsert = typeof actions.$inferInsert;
