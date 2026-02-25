import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	jsonb,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { collatePgColumn, sqlNow } from "../../../db/utils.js";
import type { InvoiceLineItemDiscount } from "./invoiceLineItemModels.js";
import { invoices } from "./invoiceTable.js";

export const invoiceLineItems = pgTable(
	"invoice_line_items",
	{
		id: text("id").primaryKey(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		invoice_id: text("invoice_id").notNull(),

		// Stripe identifiers
		stripe_id: text("stripe_id"), // Stripe invoice item/line ID
		stripe_invoice_id: text("stripe_invoice_id"), // Stripe invoice ID
		stripe_product_id: text("stripe_product_id"),
		stripe_price_id: text("stripe_price_id"),
		stripe_discountable: boolean("stripe_discountable").notNull().default(true),

		// Amounts
		amount: numeric({ mode: "number" }).notNull(), // Pre-discount amount
		amount_after_discounts: numeric({ mode: "number" }).notNull(), // Post-discount amount
		currency: text("currency").notNull().default("usd"),

		// Quantities
		total_quantity: numeric({ mode: "number" }), // Total usage (e.g., 500 messages)
		paid_quantity: numeric({ mode: "number" }), // Quantity being charged (overage)

		// Description & metadata
		description: text("description").notNull(),
		direction: text("direction").notNull(), // "charge" or "refund"
		billing_timing: text("billing_timing"), // "in_advance" or "in_arrear"
		proration: boolean("proration").notNull().default(false),

		// Autumn entity relationships
		price_id: text("price_id"), // External Autumn price ID
		customer_product_id: text("customer_product_id"), // FK -> customer_products(id)
		customer_entitlement_id: text("customer_entitlement_id"), // FK -> customer_entitlements(id)
		internal_product_id: text("internal_product_id"), // Internal product ID
		product_id: text("product_id"), // External product ID
		internal_feature_id: text("internal_feature_id"), // Internal feature ID
		feature_id: text("feature_id"), // External feature ID

		// Billing periods
		effective_period_start: numeric({ mode: "number" }), // Billing period start (ms)
		effective_period_end: numeric({ mode: "number" }), // Billing period end (ms)

		// Discounts
		discounts: jsonb("discounts")
			.$type<InvoiceLineItemDiscount>()
			.array()
			.default([]),
	},
	(table) => [
		foreignKey({
			columns: [table.invoice_id],
			foreignColumns: [invoices.id],
			name: "invoice_line_items_invoice_id_fkey",
		}).onDelete("cascade"),
	],
);

collatePgColumn(invoiceLineItems.id, "C");

export type DbInvoiceLineItem = InferSelectModel<typeof invoiceLineItems>;
export type InsertDbInvoiceLineItem = InferInsertModel<typeof invoiceLineItems>;
