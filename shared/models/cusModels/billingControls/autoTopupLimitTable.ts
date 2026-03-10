import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
	foreignKey,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../../db/utils";
import { organizations } from "../../orgModels/orgTable.js";
import { customers } from "../cusTable.js";

export const autoTopupLimitStates = pgTable(
	"auto_topup_limit_states",
	{
		id: text().primaryKey().notNull(),
		org_id: text().notNull(),
		env: text().notNull(),
		internal_customer_id: text().notNull(),
		customer_id: text().notNull(),
		feature_id: text().notNull(),

		purchase_window_ends_at: numeric({ mode: "number" }).notNull(),
		purchase_count: numeric({ mode: "number" }).notNull().default(0),

		attempt_window_ends_at: numeric({ mode: "number" }).notNull(),
		attempt_count: numeric({ mode: "number" }).notNull().default(0),

		failed_attempt_window_ends_at: numeric({ mode: "number" }).notNull(),
		failed_attempt_count: numeric({ mode: "number" }).notNull().default(0),

		last_attempt_at: numeric({ mode: "number" }),
		last_failed_attempt_at: numeric({ mode: "number" }),

		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		uniqueIndex(
			"auto_topup_limits_org_env_internal_customer_feature_unique",
		).on(table.org_id, table.env, table.internal_customer_id, table.feature_id),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "auto_topup_limits_org_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "auto_topup_limits_internal_customer_id_fkey",
		}).onDelete("cascade"),
	],
);

export type AutoTopupLimitState = InferSelectModel<typeof autoTopupLimitStates>;
export type InsertAutoTopupLimitState = InferInsertModel<
	typeof autoTopupLimitStates
>;
