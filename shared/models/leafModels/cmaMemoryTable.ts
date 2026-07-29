import { numeric, primaryKey, text } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { leafSchema } from "./leafSchema.js";

export const cmaMemory = leafSchema.table(
	"cma_memory",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		memory_store_id: text("memory_store_id").notNull(),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [primaryKey({ columns: [table.org_id, table.env] })],
);
