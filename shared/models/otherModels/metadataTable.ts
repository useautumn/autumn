import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";

export enum MetadataType {
	InvoiceActionRequired = "invoice_action_required",
	InvoiceCheckout = "invoice_checkout",
	CheckoutSessionCompleted = "checkout_session_completed",

	DeferredInvoice = "deferred_invoice",
	CheckoutSessionV2 = "checkout_session_v2",
	CheckoutSessionV2Processing = "checkout_session_v2_processing",
	CheckoutSessionEnabledImmediately = "checkout_session_enabled_immediately",
	SetupPaymentV2 = "setup_payment_v2",
}

export const metadata = pgTable(
	"metadata",
	{
		id: text().primaryKey().notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		expires_at: numeric({ mode: "number" }),
		data: jsonb(),
		type: text("type").$type<MetadataType>(),
		stripe_invoice_id: text("stripe_invoice_id"),
		stripe_checkout_session_id: text("stripe_checkout_session_id"),
	},
	(table) => [
		index("idx_metadata_type_expires")
			.on(table.type, table.expires_at)
			.where(sql`${table.expires_at} IS NOT NULL`)
			.concurrently(),
	],
);

export type Metadata = InferSelectModel<typeof metadata>;
export type MetadataInsert = InferInsertModel<typeof metadata>;
