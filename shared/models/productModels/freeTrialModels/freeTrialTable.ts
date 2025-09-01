import {
	boolean,
	foreignKey,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { products } from "../productTable.js";

export const freeTrials = pgTable(
	"free_trials",
	{
		id: text().primaryKey().notNull(),
		created_at: numeric({ mode: "number" }).notNull(),
		internal_product_id: text("internal_product_id"),
		duration: text().default("day"),
		length: numeric({ mode: "number" }),
		unique_fingerprint: boolean("unique_fingerprint"),
		is_custom: boolean("is_custom").default(false),
		card_required: boolean("card_required").default(false),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_product_id],
			foreignColumns: [products.internal_id],
			name: "free_trials_internal_product_id_fkey",
		}).onDelete("cascade"),
	],
);
