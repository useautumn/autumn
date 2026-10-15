// TEMPORARY: mirrors approvals-api-schema.md §1–2 until S3 exports these from @autumn/shared.

export type ApprovalAction =
	| "billing.attach"
	| "billing.update_subscription"
	| "billing.set_plans"
	| "billing.schedule"
	| "billing.cancel"
	| "billing.uncancel"
	| "invoices.create"
	| "invoices.finalize"
	| "invoices.pay"
	| "invoices.void"
	| "invoices.update"
	| "invoices.reissue"
	| "invoices.credit_note"
	| "balances.create"
	| "balances.update"
	| "rewards.create"
	| "rewards.apply"
	| "customers.create"
	| "customers.update"
	| "customers.delete"
	| "catalog.edit_plans"
	| "catalog.edit_features"
	| "api_keys.create"
	| "migrations.create"
	| "migrations.run"
	| "members.invite"
	| "members.change_role";

export type RuleSubject =
	| { type: "everyone" }
	| { type: "role"; role: string }
	| { type: "user"; user_id: string };

/** A migration-style filter over the area's fields; the per-area shapes arrive with S3. */
export type ActionFilter = { [field: string]: unknown };

export type ApprovalRule = {
	id: string;
	name: string;
	subjects: RuleSubject[];
	actions: ApprovalAction[];
	when: ActionFilter | null;
	note: string | null;
	enabled: boolean;
	version: number;
	updated_by: { user_id: string; name: string };
	created_at: number;
	updated_at: number;
};

export type CreateApprovalRuleParams = {
	name: string;
	subjects: RuleSubject[];
	actions: ApprovalAction[];
	when?: ActionFilter | null;
	note?: string | null;
	enabled?: boolean;
};
