import {
	boolean,
	foreignKey,
	integer,
	numeric,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { customers } from "../cusModels/cusTable.js";

export const customerJwtFamilies = pgTable(
	"customer_jwt_families",
	{
		internal_id: text("internal_id").primaryKey().notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		epoch: integer("epoch").notNull().default(0),
		refresh_kid: integer("refresh_kid").notNull().default(0),
		indefinite: boolean("indefinite").notNull().default(false),
		created_at: numeric("created_at", { mode: "number" }).notNull(),
		updated_at: numeric("updated_at", { mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "customer_jwt_families_internal_customer_id_fkey",
		}).onDelete("cascade"),
		unique("customer_jwt_families_internal_customer_id_key").on(
			table.internal_customer_id,
		),
	],
);

export type CustomerJwtFamily = typeof customerJwtFamilies.$inferSelect;
