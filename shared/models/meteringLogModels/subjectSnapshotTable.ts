import { sql } from "drizzle-orm";
import {
	bigint,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../db/utils.js";
import { customers } from "../cusModels/cusTable.js";
import { entities } from "../cusModels/entityModels/entityTable.js";

export const subjectSnapshots = pgTable(
	"subject_snapshots",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		customer_id: text("customer_id").notNull(),
		entity_id: text("entity_id").notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		internal_entity_id: text("internal_entity_id"),
		partition: integer("partition").notNull(),
		partition_count: integer("partition_count").notNull(),
		state_version: integer("state_version").notNull(),
		state: jsonb("state").notNull(),
		baseline_at: bigint("baseline_at", { mode: "number" }).notNull(),
		written_at: bigint("written_at", { mode: "number" }).notNull(),
		log_offset: bigint("log_offset", { mode: "bigint" }),
	},
	(table) => [
		primaryKey({
			columns: [table.org_id, table.env, table.customer_id, table.entity_id],
			name: "subject_snapshots_pkey",
		}),
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "subject_snapshots_internal_customer_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_entity_id],
			foreignColumns: [entities.internal_id],
			name: "subject_snapshots_internal_entity_id_fkey",
		}).onDelete("cascade"),
		index("idx_subject_snapshots_partition").on(
			table.partition,
			table.partition_count,
		),
		index("idx_subject_snapshots_internal_customer_id").on(
			table.internal_customer_id,
		),
		index("idx_subject_snapshots_internal_entity_id")
			.on(table.internal_entity_id)
			.where(sql`${table.internal_entity_id} IS NOT NULL`),
	],
);

collatePgColumn(subjectSnapshots.org_id, "C");
collatePgColumn(subjectSnapshots.env, "C");
collatePgColumn(subjectSnapshots.customer_id, "C");
collatePgColumn(subjectSnapshots.entity_id, "C");
collatePgColumn(subjectSnapshots.internal_customer_id, "C");
collatePgColumn(subjectSnapshots.internal_entity_id, "C");

export type SubjectSnapshot = typeof subjectSnapshots.$inferSelect;
