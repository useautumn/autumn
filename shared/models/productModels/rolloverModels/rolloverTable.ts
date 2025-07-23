import {
	foreignKey,
	pgTable,
	numeric,
	jsonb,
	text,
	integer,
	uuid,
} from "drizzle-orm/pg-core";

import { EntityBalance } from "../../cusProductModels/cusEntModels/cusEntModels.js";
import { customerEntitlements } from "../../cusProductModels/cusEntModels/cusEntTable.js";

export const rollovers = pgTable(
	"rollovers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		cus_ent_id: text("cus_ent_id").notNull(),
		balance: numeric({ mode: "number" }).notNull(),
		expires_at: numeric({ mode: "number" }).notNull(),
		entities: jsonb("entities").$type<EntityBalance>(),
	},
	(table) => [
		foreignKey({
			columns: [table.cus_ent_id],
			foreignColumns: [customerEntitlements.id],
			name: "rollover_cus_ent_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	]
).enableRLS();
