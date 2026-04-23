import type { AttachParamsV1 } from "@api/billing/attachV2/attachParamsV1";
import type { BillingResponse } from "@api/billing/common/billingResponse";
import type { CreateScheduleParamsV0 } from "@api/billing/createSchedule/createScheduleParamsV0";
import type { UpdateSubscriptionV1Params } from "@api/billing/updateSubscription/updateSubscriptionV1Params";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils";

export enum CheckoutStatus {
	Pending = "pending",
	ActionRequired = "action_required",
	Completed = "completed",
	Expired = "expired",
}

export enum CheckoutAction {
	Attach = "attach",
	CreateSchedule = "create_schedule",
	UpdateSubscription = "update_subscription",
}

export type CheckoutParams =
	| AttachParamsV1
	| CreateScheduleParamsV0
	| UpdateSubscriptionV1Params;

export const checkouts = pgTable(
	"checkouts",
	{
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
		response: jsonb().$type<BillingResponse | null>(),
		stripe_invoice_id: text(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		expires_at: numeric({ mode: "number" }).notNull(),
		completed_at: numeric({ mode: "number" }),
	},
	(table) => [
		index("idx_checkouts_stripe_invoice_id").on(table.stripe_invoice_id),
	],
);

export type Checkout = InferSelectModel<typeof checkouts>;
export type InsertCheckout = InferInsertModel<typeof checkouts>;
