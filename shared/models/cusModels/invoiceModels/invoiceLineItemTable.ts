import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { collatePgColumn, sqlNow } from "../../../db/utils.js";
import type {
	InvoiceLineItemDiscount,
	InvoiceLineItemEntity,
} from "./invoiceLineItemModels.js";
import { invoices } from "./invoiceTable.js";

export const invoiceLineItems = pgTable(
	"invoice_line_items",
	{
		id: text("id").primaryKey(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		invoice_id: text("invoice_id"),
		stripe_id: text("stripe_id"),
		stripe_invoice_id: text("stripe_invoice_id"),
		stripe_invoice_item_id: text("stripe_invoice_item_id"),
		stripe_subscription_item_id: text("stripe_subscription_item_id"),
		stripe_product_id: text("stripe_product_id"),
		stripe_price_id: text("stripe_price_id"),
		stripe_discountable: boolean("stripe_discountable").notNull().default(true),

		amount: numeric({ mode: "number" }).notNull(),
		amount_after_discounts: numeric({ mode: "number" }).notNull(),
		currency: text("currency").notNull().default("usd"),

		stripe_quantity: numeric({ mode: "number" }),
		total_quantity: numeric({ mode: "number" }),
		paid_quantity: numeric({ mode: "number" }),
		description: text("description").notNull(),
		description_source: text("description_source"),
		direction: text("direction").notNull(),
		billing_timing: text("billing_timing"),
		prorated: boolean("prorated").notNull().default(false),

		price_id: text("price_id"),
		customer_product_ids: jsonb("customer_product_ids")
			.$type<string[]>()
			.notNull()
			.default([]),
		customer_price_ids: jsonb("customer_price_ids")
			.$type<string[]>()
			.notNull()
			.default([]),
		customer_entitlement_ids: jsonb("customer_entitlement_ids")
			.$type<string[]>()
			.notNull()
			.default([]),
		internal_product_id: text("internal_product_id"),
		product_id: text("product_id"),
		internal_feature_id: text("internal_feature_id"),
		feature_id: text("feature_id"),
		effective_period_start: numeric({ mode: "number" }),
		effective_period_end: numeric({ mode: "number" }),
		discounts: jsonb("discounts")
			.$type<InvoiceLineItemDiscount>()
			.array()
			.default([]),

		entities: jsonb("entities")
			.$type<InvoiceLineItemEntity[]>()
			.notNull()
			.default([]),
	},
	(table) => [
		foreignKey({
			columns: [table.invoice_id],
			foreignColumns: [invoices.id],
			name: "invoice_line_items_invoice_id_fkey",
		}).onDelete("cascade"),
		unique("invoice_line_items_stripe_id_unique").on(table.stripe_id),
		index("idx_invoice_line_items_customer_product_ids").using(
			"gin",
			table.customer_product_ids,
		),
		index("idx_invoice_line_items_stripe_invoice_id")
			.on(table.stripe_invoice_id)
			.where(sql`${table.stripe_invoice_id} IS NOT NULL`)
			.concurrently(),
		index("idx_invoice_line_items_invoice_id")
			.on(table.invoice_id)
			.where(sql`${table.invoice_id} IS NOT NULL`)
			.concurrently(),
		index("idx_invoice_line_items_stripe_invoice_item_id")
			.on(table.stripe_invoice_item_id)
			.where(sql`${table.stripe_invoice_item_id} IS NOT NULL`)
			.concurrently(),
	],
);

collatePgColumn(invoiceLineItems.id, "C");

export type DbInvoiceLineItem = InferSelectModel<typeof invoiceLineItems>;
export type InsertDbInvoiceLineItem = InferInsertModel<typeof invoiceLineItems>;
