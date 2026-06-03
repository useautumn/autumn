import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
	foreignKey,
	integer,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { organizations } from "../orgModels/orgTable.js";

export const invoiceTemplates = pgTable(
	"invoice_templates",
	{
		internal_id: text("internal_id").primaryKey().notNull(),
		id: text().unique(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		created_at: numeric({ mode: "number" }),
		name: text().notNull(),
		footer: text(),
		memo: text(),
		net_terms_days: integer("net_terms_days"),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "invoice_templates_org_id_fkey",
		}).onDelete("cascade"),
	],
);

export type InvoiceTemplateRow = InferSelectModel<typeof invoiceTemplates>;
export type InsertInvoiceTemplateRow = InferInsertModel<
	typeof invoiceTemplates
>;
