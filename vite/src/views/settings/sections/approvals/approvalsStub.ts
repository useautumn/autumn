// TEMPORARY: S3/S2b names pinned by ATMN-1178 (handoffs/approvals-rebuild-fe.md). Swap every import of this file for @autumn/shared once S3 freezes.
import { WHEN_FIELD_LABELS } from "@autumn/shared";

export type ApprovalRuleEffect = "allow" | "block";

export type RuleSubject =
	| { type: "everyone" }
	| { type: "role"; role_id: string }
	| { type: "user"; user_id: string };

export type ApprovalFilterKey =
	| "billing_change"
	| "billing_cancel"
	| "billing_uncancel"
	| "invoice"
	| "balance_create"
	| "balance_update"
	| "reward_redeem"
	| "customer_change"
	| "plan"
	| "feature";

export type ApprovalRuleFilter = Record<string, unknown>;

type ActionDefinition = {
	/** How the action reads in a rule sentence. */
	label: string;
	filter: ApprovalFilterKey | null;
};

export const ACTIONS = {
	"billing.attach": { label: "Attach", filter: "billing_change" },
	"billing.update": { label: "Update", filter: "billing_change" },
	"billing.set_plans": { label: "Set plans", filter: "billing_change" },
	"billing.create_schedule": {
		label: "Create schedule",
		filter: "billing_change",
	},
	"billing.cancel": { label: "Cancel", filter: "billing_cancel" },
	"billing.uncancel": { label: "Uncancel", filter: "billing_uncancel" },
	"invoices.create": { label: "Create invoices", filter: "invoice" },
	"invoices.finalize": { label: "Finalize invoices", filter: "invoice" },
	"invoices.pay": { label: "Pay invoices", filter: "invoice" },
	"invoices.void": { label: "Void invoices", filter: "invoice" },
	"invoices.update": { label: "Update invoices", filter: "invoice" },
	"invoices.reissue": { label: "Reissue invoices", filter: "invoice" },
	"invoices.issue_credit_note": {
		label: "Issue credit notes",
		filter: "invoice",
	},
	"balances.create": { label: "Grant credits", filter: "balance_create" },
	"balances.update": { label: "Set balance", filter: "balance_update" },
	"rewards.create": { label: "Create rewards", filter: null },
	"rewards.redeem": { label: "Redeem rewards", filter: "reward_redeem" },
	"customers.get_or_create": { label: "Create customers", filter: null },
	"customers.update": { label: "Update customers", filter: "customer_change" },
	"customers.delete": { label: "Delete customers", filter: "customer_change" },
	"plans.create": { label: "Create plans", filter: "plan" },
	"plans.update": { label: "Update plans", filter: "plan" },
	"plans.delete": { label: "Delete plans", filter: "plan" },
	"features.create": { label: "Create features", filter: "feature" },
	"features.update": { label: "Update features", filter: "feature" },
	"features.delete": { label: "Delete features", filter: "feature" },
	"api_keys.create": { label: "Create API keys", filter: null },
	"migrations.create": { label: "Create migrations", filter: null },
	"migrations.run": { label: "Run migrations", filter: null },
} as const satisfies Record<string, ActionDefinition>;

export type ApprovalAction = keyof typeof ACTIONS;

export type ApprovalRule = {
	id: string;
	name: string;
	effect: ApprovalRuleEffect;
	position: number;
	subjects: RuleSubject[];
	actions: ApprovalAction[];
	filter: ApprovalRuleFilter | null;
	note: string | null;
	enabled: boolean;
	version: number;
	updated_by: { user_id: string; name: string };
	created_at: number;
	updated_at: number;
};

export type ApprovalRuleUpdateParams = Partial<
	Pick<
		ApprovalRule,
		"name" | "effect" | "subjects" | "actions" | "filter" | "note" | "enabled"
	>
>;

/** Roles as `roles.list` returns them (`@autumn/shared/api/roles/apiRole`). */
export type ApiRole = {
	id: string;
	name: string;
	built_in: boolean;
	access: Record<string, "none" | "read" | "write">;
	member_count: number;
	rule_count: number;
};

const withHasPaid = <Labels extends Record<string, string>>(
	labels: Labels,
) => ({
	...labels,
	"customer.has_paid": "Customer has paid before",
});

export const APPROVAL_FILTER_FIELD_LABELS: Record<
	ApprovalFilterKey,
	Record<string, string>
> = {
	billing_change: withHasPaid({
		...WHEN_FIELD_LABELS.billing_change,
		"incoming.free_trial.duration": "Free trial",
		entity: "Level",
		"entity.feature_id": "Entity type",
		billing_cycle_anchor: "Billing cycle",
	}),
	billing_cancel: withHasPaid(WHEN_FIELD_LABELS.billing_cancel),
	billing_uncancel: withHasPaid(WHEN_FIELD_LABELS.billing_cancel),
	invoice: withHasPaid(WHEN_FIELD_LABELS.invoice),
	balance_create: withHasPaid(WHEN_FIELD_LABELS.balance_create),
	balance_update: withHasPaid(WHEN_FIELD_LABELS.balance_update),
	reward_redeem: withHasPaid(WHEN_FIELD_LABELS.reward_apply),
	customer_change: withHasPaid(WHEN_FIELD_LABELS.customer),
	plan: { "plan.plan_id": "Plan" },
	feature: WHEN_FIELD_LABELS.catalog_feature,
};
