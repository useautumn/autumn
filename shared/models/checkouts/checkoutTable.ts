import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import type { AttachParamsV0 } from "../../api/billing/attachV2/attachParamsV0.js";
import type { UpdateSubscriptionV0Params } from "../../api/billing/updateSubscription/updateSubscriptionV0Params.js";
import { sqlNow } from "../../db/utils.js";

export enum CheckoutStatus {
	Pending = "pending",
	Completed = "completed",
	Expired = "expired",
}

export enum CheckoutAction {
	Attach = "attach",
	UpdateSubscription = "update_subscription",
}

export type CheckoutParams = AttachParamsV0 | UpdateSubscriptionV0Params;

export const checkouts = pgTable("checkouts", {
	id: text().primaryKey().notNull(),
	org_id: text().notNull(),
	env: text().notNull(),
	internal_customer_id: text().notNull(),
	customer_id: text().notNull(),
	action: text().$type<CheckoutAction>().notNull(),
	params: jsonb().$type<CheckoutParams>().notNull(),
	params_version: integer().notNull().default(0),
	status: text()
		.$type<CheckoutStatus>()
		.notNull()
		.default(CheckoutStatus.Pending),
	created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	expires_at: numeric({ mode: "number" }).notNull(),
	completed_at: numeric({ mode: "number" }),
});

export type Checkout = InferSelectModel<typeof checkouts>;
export type InsertCheckout = InferInsertModel<typeof checkouts>;
