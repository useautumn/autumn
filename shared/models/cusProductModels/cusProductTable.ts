import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../db/utils.js";
import { customers } from "../cusModels/cusTable.js";
import { entities } from "../cusModels/entityModels/entityTable.js";
import { freeTrials } from "../productModels/freeTrialModels/freeTrialTable.js";
import { products } from "../productModels/productTable.js";

export type CustomerProductProcessor = {
	type: "stripe" | "revenuecat";
	id: string;
};

export const customerProducts = pgTable(
	"customer_products",
	{
		id: text().primaryKey().notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		internal_product_id: text("internal_product_id").notNull(),
		internal_entity_id: text("internal_entity_id"),

		created_at: numeric({ mode: "number" }),
		updated_at: numeric({ mode: "number" }),
		status: text(),
		processor: jsonb().$type<CustomerProductProcessor>(),
		// processors: jsonb().$type<ExternalCusProductProcessors>(),

		canceled: boolean("canceled").default(false),
		canceled_at: numeric({ mode: "number" }),
		ended_at: numeric({ mode: "number" }),
		starts_at: numeric({ mode: "number" }),
		access_starts_at: numeric({ mode: "number" }),
		options: jsonb().array(),
		product_id: text("product_id"),
		free_trial_id: text("free_trial_id"),
		trial_ends_at: numeric({ mode: "number" }),
		billing_cycle_anchor: numeric({ mode: "number" }),
		billing_cycle_anchor_resets_at: numeric({ mode: "number" }),
		collection_method: text("collection_method").default(
			"charge_automatically",
		),
		subscription_ids: text("subscription_ids").array(),
		scheduled_ids: text("scheduled_ids").array(),
		quantity: numeric({ mode: "number" }).default(1),

		is_custom: boolean("is_custom").default(false).notNull(),
		license_parent_customer_product_id: text(
			"license_parent_customer_product_id",
		),
		// Marks the row as a license assignment (seat) of that pool. The pool
		// carries the shared parent, so transitions re-point ONE pool row.
		customer_license_id: text("customer_license_id"),

		// Optional...
		customer_id: text("customer_id"),
		entity_id: text("entity_id"),
		billing_version: text("billing_version"),

		api_version: numeric({ mode: "number" }),
		api_semver: text("api_semver"),

		external_id: text("external_id"),

		// When the cusProduct was created via a Stripe checkout flow with
		// enable_plan_immediately, this links the row to the pending checkout session
		// so the webhook can patch in subscription_ids on completion (or expire on abandonment).
		stripe_checkout_session_id: text("stripe_checkout_session_id"),

		previous_customer_product_id: text("previous_customer_product_id"),
		on_trial_end: text("on_trial_end"),
	},
	(table) => [
		foreignKey({
			columns: [table.free_trial_id],
			foreignColumns: [freeTrials.id],
			name: "customer_products_free_trial_id_fkey",
		}),
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "customer_products_internal_customer_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.internal_product_id],
			foreignColumns: [products.internal_id],
			name: "customer_products_internal_product_id_fkey",
		}),
		foreignKey({
			columns: [table.internal_entity_id],
			foreignColumns: [entities.internal_id],
			name: "customer_products_internal_entity_id_fkey",
		}).onDelete("set null"),
		index("idx_customer_products_customer_status").on(
			table.internal_customer_id,
			table.status,
		),
		index("idx_customer_products_customer_status_created_at")
			.on(
				table.internal_customer_id,
				table.status,
				sql`${table.created_at} DESC`,
			)
			.concurrently(),
		index("idx_customer_products_product_status")
			.on(table.internal_product_id, table.status)
			.concurrently(),
		index("idx_customer_products_on_internal_entity_id").on(
			table.internal_entity_id,
		),
		index("idx_customer_products_on_internal_product_id").on(
			table.internal_product_id,
		),
		index("idx_customer_products_subscription_ids").using(
			"gin",
			table.subscription_ids,
		),
		index("idx_customer_products_scheduled_ids").using(
			"gin",
			table.scheduled_ids,
		),
		index("idx_customer_products_stripe_checkout_session_id").on(
			table.stripe_checkout_session_id,
		),
		index("idx_customer_products_license_parent")
			.on(table.license_parent_customer_product_id)
			.where(sql`${table.license_parent_customer_product_id} IS NOT NULL`)
			.concurrently(),
		uniqueIndex("unique_active_license_assignment")
			.on(
				table.license_parent_customer_product_id,
				table.internal_entity_id,
				table.internal_product_id,
			)
			.where(
				sql`${table.license_parent_customer_product_id} IS NOT NULL AND ${table.internal_entity_id} IS NOT NULL AND ${table.status} IN ('active', 'past_due', 'trialing')`,
			)
			.concurrently(),
		index("idx_customer_products_customer_license")
			.on(table.customer_license_id)
			.where(sql`${table.customer_license_id} IS NOT NULL`)
			.concurrently(),
		// One active seat per (pool, entity); the pool already pins the license.
		uniqueIndex("unique_active_pool_assignment")
			.on(table.customer_license_id, table.internal_entity_id)
			.where(
				sql`${table.customer_license_id} IS NOT NULL AND ${table.internal_entity_id} IS NOT NULL AND ${table.status} IN ('active', 'past_due')`,
			)
			.concurrently(),
		index("idx_customer_products_free_trial_id")
			.on(table.free_trial_id)
			.where(sql`${table.free_trial_id} IS NOT NULL`)
			.concurrently(),
		index("idx_customer_products_revenuecat_processor")
			.on(table.internal_customer_id)
			.where(sql`(${table.processor} ->> 'type') = 'revenuecat'`),
		index("idx_customer_products_ended_at")
			.on(table.ended_at)
			.where(
				sql`${table.status} IN ('active', 'past_due') AND ${table.ended_at} IS NOT NULL`,
			)
			.concurrently(),
		index("idx_customer_products_trial_ends_at")
			.on(table.trial_ends_at)
			.where(
				sql`${table.status} IN ('active', 'past_due') AND ${table.trial_ends_at} IS NOT NULL`,
			)
			.concurrently(),
		index("idx_customer_products_product_id")
			.on(table.product_id)
			.concurrently(),
	],
);

collatePgColumn(customerProducts.id, "C");

export type CustomerProduct = InferSelectModel<typeof customerProducts>;
export type InsertCustomerProduct = InferInsertModel<typeof customerProducts>;
export type DbCustomerProduct = InferSelectModel<typeof customerProducts>;
export type InsertDbCustomerProduct = InferInsertModel<typeof customerProducts>;
