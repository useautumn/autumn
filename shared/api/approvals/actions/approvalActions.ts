import { z } from "zod/v4";
import { type ScopeString, Scopes } from "../../../utils/scopeDefinitions";
import type { ApprovalFilterKey } from "../schemas/filters/approvalFilterShapes";

/** Rule areas, named after the route prefix. A rule's actions all come from one area. */
export const APPROVAL_AREAS = {
	billing: "Billing",
	invoices: "Invoices",
	balances: "Balances",
	rewards: "Rewards",
	customers: "Customers",
	plans: "Plans",
	features: "Features",
	api_keys: "API keys",
	migrations: "Migrations",
	members: "Members",
} as const;

export type ApprovalArea = keyof typeof APPROVAL_AREAS;

type ActionDefinition = {
	area: ApprovalArea;
	label: string;
	/** Label for a rule sentence when `label` is a bare verb ("Create" → "Create invoices"). */
	sentence_label?: string;
	/** Required before any rule applies; rules only narrow it. */
	scope: ScopeString;
	/** Which filter fields a rule on this action can use; null = who-only. */
	filter: ApprovalFilterKey | null;
};

/** Every action a rule can name. Ids are the RPC route names they gate. */
export const ACTIONS = {
	"billing.attach": {
		area: "billing",
		label: "Attach",
		scope: Scopes.Billing.Write,
		filter: "billing_change",
	},
	"billing.update": {
		area: "billing",
		label: "Update subscription",
		scope: Scopes.Billing.Write,
		filter: "billing_change",
	},
	"billing.set_plans": {
		area: "billing",
		label: "Set plans",
		scope: Scopes.Billing.Write,
		filter: "billing_change",
	},
	"billing.create_schedule": {
		area: "billing",
		label: "Create schedule",
		scope: Scopes.Billing.Write,
		filter: "billing_change",
	},
	"billing.cancel": {
		area: "billing",
		label: "Cancel",
		scope: Scopes.Billing.Write,
		filter: "billing_cancel",
	},
	"billing.uncancel": {
		area: "billing",
		label: "Uncancel",
		scope: Scopes.Billing.Write,
		filter: "billing_uncancel",
	},

	"invoices.create": {
		area: "invoices",
		label: "Create",
		sentence_label: "Create invoices",
		scope: Scopes.Billing.Write,
		filter: "invoice",
	},
	"invoices.finalize": {
		area: "invoices",
		label: "Finalize",
		sentence_label: "Finalize invoices",
		scope: Scopes.Billing.Write,
		filter: "invoice",
	},
	"invoices.pay": {
		area: "invoices",
		label: "Pay",
		sentence_label: "Pay invoices",
		scope: Scopes.Billing.Write,
		filter: "invoice",
	},
	"invoices.void": {
		area: "invoices",
		label: "Void",
		sentence_label: "Void invoices",
		scope: Scopes.Billing.Write,
		filter: "invoice",
	},
	"invoices.update": {
		area: "invoices",
		label: "Update",
		sentence_label: "Update invoices",
		scope: Scopes.Billing.Write,
		filter: "invoice",
	},
	"invoices.reissue": {
		area: "invoices",
		label: "Reissue",
		sentence_label: "Reissue invoices",
		scope: Scopes.Billing.Write,
		filter: "invoice",
	},
	"invoices.issue_credit_note": {
		area: "invoices",
		label: "Issue credit note",
		sentence_label: "Issue credit notes",
		scope: Scopes.Billing.Write,
		filter: "invoice",
	},

	"balances.create": {
		area: "balances",
		label: "Grant credits",
		scope: Scopes.Balances.Write,
		filter: "balance_create",
	},
	"balances.update": {
		area: "balances",
		label: "Set balance",
		scope: Scopes.Balances.Write,
		filter: "balance_update",
	},

	"rewards.create": {
		area: "rewards",
		label: "Create reward",
		scope: Scopes.Rewards.Write,
		filter: null,
	},
	"rewards.redeem": {
		area: "rewards",
		label: "Redeem reward",
		scope: Scopes.Rewards.Write,
		filter: "reward_redeem",
	},

	"customers.get_or_create": {
		area: "customers",
		label: "Create",
		sentence_label: "Create customers",
		scope: Scopes.Customers.Write,
		filter: null,
	},
	"customers.update": {
		area: "customers",
		label: "Update",
		sentence_label: "Update customers",
		scope: Scopes.Customers.Write,
		filter: "customer_change",
	},
	"customers.delete": {
		area: "customers",
		label: "Delete",
		sentence_label: "Delete customers",
		scope: Scopes.Customers.Write,
		filter: "customer_change",
	},

	"plans.create": {
		area: "plans",
		label: "Create",
		sentence_label: "Create plans",
		scope: Scopes.Plans.Write,
		filter: "plan",
	},
	"plans.update": {
		area: "plans",
		label: "Update",
		sentence_label: "Update plans",
		scope: Scopes.Plans.Write,
		filter: "plan",
	},
	"plans.delete": {
		area: "plans",
		label: "Delete",
		sentence_label: "Delete plans",
		scope: Scopes.Plans.Write,
		filter: "plan",
	},

	"features.create": {
		area: "features",
		label: "Create",
		sentence_label: "Create features",
		scope: Scopes.Features.Write,
		filter: "feature",
	},
	"features.update": {
		area: "features",
		label: "Update",
		sentence_label: "Update features",
		scope: Scopes.Features.Write,
		filter: "feature",
	},
	"features.delete": {
		area: "features",
		label: "Delete",
		sentence_label: "Delete features",
		scope: Scopes.Features.Write,
		filter: "feature",
	},

	"api_keys.create": {
		area: "api_keys",
		label: "Create",
		sentence_label: "Create API keys",
		scope: Scopes.ApiKeys.Write,
		filter: null,
	},

	"migrations.create": {
		area: "migrations",
		label: "Create",
		sentence_label: "Create migrations",
		scope: Scopes.Migrations.Write,
		filter: null,
	},
	"migrations.run": {
		area: "migrations",
		label: "Run",
		sentence_label: "Run migrations",
		scope: Scopes.Migrations.Write,
		filter: null,
	},

	"members.invite": {
		area: "members",
		label: "Invite",
		sentence_label: "Invite members",
		scope: Scopes.Organisation.Write,
		filter: null,
	},
	"members.change_role": {
		area: "members",
		label: "Change role",
		sentence_label: "Change member roles",
		scope: Scopes.Organisation.Write,
		filter: null,
	},
} as const satisfies Record<string, ActionDefinition>;

export type ApprovalAction = keyof typeof ACTIONS;

export const ApprovalActionSchema = z.enum(
	Object.keys(ACTIONS) as [ApprovalAction, ...ApprovalAction[]],
);

/** Routes that are checked as another action rather than named in rules. */
export const ACTION_ALIASES = {
	"billing.multi_attach": "billing.attach",
	"billing.multi_update": "billing.update",
	"migrations.lazy_run": "migrations.run",
} as const satisfies Record<string, ApprovalAction>;
