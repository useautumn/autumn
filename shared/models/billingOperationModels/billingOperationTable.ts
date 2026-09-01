import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { jsonb, numeric, pgTable, text, unique } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils";

export const BillingOperationAction = {
	Attach: "attach",
	CreateSchedule: "create_schedule",
	UpdateSubscription: "update_subscription",
} as const;

export type BillingOperationAction =
	(typeof BillingOperationAction)[keyof typeof BillingOperationAction];

export const BillingOperationState = {
	Pending: "pending",
	Succeeded: "succeeded",
	Failed: "failed",
} as const;

export type BillingOperationState =
	(typeof BillingOperationState)[keyof typeof BillingOperationState];

export type BillingOperationCanonicalRequest = Record<string, unknown>;

export const billingOperations = pgTable(
	"billing_operations",
	{
		org_id: text().notNull(),
		env: text().notNull(),
		operation_id: text().notNull(),
		billing_action: text().$type<BillingOperationAction>().notNull(),
		canonical_request_hash: text().notNull(),
		canonical_request: jsonb()
			.$type<BillingOperationCanonicalRequest>()
			.notNull(),
		state: text()
			.$type<BillingOperationState>()
			.notNull()
			.default(BillingOperationState.Pending),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		expires_at: numeric({ mode: "number" }).notNull(),
	},
	(table) => [
		unique("billing_operations_org_env_operation_id_key").on(
			table.org_id,
			table.env,
			table.operation_id,
		),
	],
);

export type BillingOperation = InferSelectModel<typeof billingOperations>;
export type InsertBillingOperation = InferInsertModel<typeof billingOperations>;
