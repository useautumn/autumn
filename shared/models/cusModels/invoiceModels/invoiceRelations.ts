import { customers } from "../cusTable.js";
import { invoices } from "./invoiceTable.js";
import { relations } from "drizzle-orm";

export const invoiceRelations = relations(invoices, ({ one }) => ({
  customer: one(customers, {
    fields: [invoices.internal_customer_id],
    references: [customers.internal_id],
  }),
}));
