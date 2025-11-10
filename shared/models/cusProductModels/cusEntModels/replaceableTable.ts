import {
	bigint,
	boolean,
	foreignKey,
	index,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { customerEntitlements } from "./cusEntTable.js";

export const replaceables = pgTable(
	"replaceables",
	{
		id: text().primaryKey().notNull(),
		cus_ent_id: text().notNull(),
		created_at: bigint({ mode: "number" }).notNull(),
		from_entity_id: text(),
		delete_next_cycle: boolean("delete_next_cycle").notNull().default(false),
	},
	(table) => [
		foreignKey({
			columns: [table.cus_ent_id],
			foreignColumns: [customerEntitlements.id],
			name: "replaceables_cus_ent_id_fkey",
		}).onDelete("cascade"),
		index("idx_replaceables_cus_ent_id").on(table.cus_ent_id),
	],
).enableRLS();

export type Replaceable = typeof replaceables.$inferSelect;
export type InsertReplaceable = typeof replaceables.$inferInsert;
