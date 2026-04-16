import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	numeric,
	pgTable,
	text,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { customers } from "../cusModels/cusTable.js";
import { entities } from "../cusModels/entityModels/entityTable.js";
import { organizations } from "../orgModels/orgTable.js";

export const schedules = pgTable(
	"schedules",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		customer_id: text("customer_id").notNull(),
		internal_entity_id: text("internal_entity_id"),
		entity_id: text("entity_id"),
		created_at: numeric({ mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "schedules_org_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "schedules_internal_customer_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_entity_id],
			foreignColumns: [entities.internal_id],
			name: "schedules_internal_entity_id_fkey",
		}).onDelete("set null"),
		uniqueIndex("schedules_customer_scope_unique")
			.on(table.org_id, table.env, table.internal_customer_id)
			.where(sql`${table.internal_entity_id} IS NULL`),
		uniqueIndex("schedules_entity_scope_unique")
			.on(
				table.org_id,
				table.env,
				table.internal_customer_id,
				table.internal_entity_id,
			)
			.where(sql`${table.internal_entity_id} IS NOT NULL`),
		index("idx_schedules_internal_customer_id").on(table.internal_customer_id),
		index("idx_schedules_internal_entity_id").on(table.internal_entity_id),
	],
);

export const schedulePhases = pgTable(
	"phases",
	{
		id: text().primaryKey().notNull(),
		schedule_id: text("schedule_id").notNull(),
		starts_at: numeric({ mode: "number" }).notNull(),
		customer_product_ids: text("customer_product_ids")
			.array()
			.default([])
			.notNull(),
		created_at: numeric({ mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.schedule_id],
			foreignColumns: [schedules.id],
			name: "phases_schedule_id_fkey",
		}).onDelete("cascade"),
		unique("phases_schedule_id_starts_at_key").on(
			table.schedule_id,
			table.starts_at,
		),
	],
);

export type Schedule = InferSelectModel<typeof schedules>;
export type InsertSchedule = InferInsertModel<typeof schedules>;
export type SchedulePhase = InferSelectModel<typeof schedulePhases>;
export type InsertSchedulePhase = InferInsertModel<typeof schedulePhases>;
