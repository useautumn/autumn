import { relations } from "drizzle-orm";
import { customers } from "../cusTable.js";
import { invoices } from "./invoiceTable.js";

export const invoiceRelations = relations(invoices, ({ one }) => ({
	customer: one(customers, {
		fields: [invoices.internal_customer_id],
		references: [customers.internal_id],
	}),
}));
