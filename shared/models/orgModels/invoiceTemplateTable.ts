import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { foreignKey, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { organizations } from "./orgTable.js";

export const invoiceTemplates = pgTable(
	"invoice_templates",
	{
		internal_id: text("internal_id").primaryKey().notNull(),
		id: text(),
		org_id: text("org_id"),
		env: text(),
		created_at: numeric({ mode: "number" }),
		name: text(),
		footer: text(),
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
