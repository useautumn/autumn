import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	jsonb,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../db/utils.js";
import { customers } from "../cusModels/cusTable.js";
import { entities } from "../cusModels/entityModels/entityTable.js";
import { freeTrials } from "../productModels/freeTrialModels/freeTrialTable.js";
import { products } from "../productModels/productTable.js";

export type CustomerProductProcessor = {
	type: "stripe";
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
		status: text(),
		processor: jsonb().$type<CustomerProductProcessor>(),
		// processors: jsonb().$type<ExternalCusProductProcessors>(),

		canceled: boolean("canceled").default(false),
		canceled_at: numeric({ mode: "number" }),
		ended_at: numeric({ mode: "number" }),
		starts_at: numeric({ mode: "number" }),
		options: jsonb().array(),
		product_id: text("product_id"),
		free_trial_id: text("free_trial_id"),
		trial_ends_at: numeric({ mode: "number" }),
		collection_method: text("collection_method").default(
			"charge_automatically",
		),
		subscription_ids: text("subscription_ids").array(),
		scheduled_ids: text("scheduled_ids").array(),
		quantity: numeric({ mode: "number" }).default(1),

		is_custom: boolean("is_custom").default(false).notNull(),

		// Optional...
		customer_id: text("customer_id"),
		entity_id: text("entity_id"),
		api_version: numeric({ mode: "number" }),
		api_semver: text("api_semver"),
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
	],
);

collatePgColumn(customerProducts.id, "C");

export type CustomerProduct = InferSelectModel<typeof customerProducts>;
export type InsertCustomerProduct = InferInsertModel<typeof customerProducts>;
