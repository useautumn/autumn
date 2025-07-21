import {
	foreignKey,
	pgTable,
	numeric,
	jsonb,
	text,
	integer,
} from "drizzle-orm/pg-core";

import { entitlements } from "../entModels/entTable.js";
import { EntityBalance } from "../../cusProductModels/cusEntModels/cusEntModels.js";

export const rollovers = pgTable(
	"rollovers",
	{
		cus_ent_id: text("cus_ent_id").notNull(),
		balance: numeric({ mode: "number" }).notNull(),
		expires_at: integer("timestamp").notNull(),
		entities: jsonb("entities").$type<EntityBalance>(),
	},
	(table) => [
		foreignKey({
			columns: [table.cus_ent_id],
			foreignColumns: [entitlements.id],
			name: "rollover_cus_ent_id_fkey",
		}),
	]
).enableRLS();
