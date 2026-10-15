import { z } from "zod/v4";
import { type ScopeString, Scopes } from "../../../utils/scopeDefinitions";
import type { WhenKey } from "../schemas/when/whenSchemas";

/** Rule areas. A rule's actions all come from one area. */
export const APPROVAL_AREAS = {
	billing: "Billing",
	invoices: "Invoices",
	balances: "Balances",
	rewards: "Rewards",
	customers: "Customers",
	catalog: "Catalog",
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
	/** Coarse scope that allows this action when no rule covers it. */
	scope: ScopeString;
	/** Which `when` fields a rule on this action can use; null = who-only. */
	when: WhenKey | null;
};

const billingChangeAction = ({ label }: { label: string }) =>
	({
		area: "billing",
		label,
		scope: Scopes.Billing.Write,
		when: "billing_change",
	}) as const satisfies ActionDefinition;

const billingCancelAction = ({ label }: { label: string }) =>
	({
		area: "billing",
		label,
		scope: Scopes.Billing.Write,
		when: "billing_cancel",
	}) as const satisfies ActionDefinition;

const invoiceAction = ({
	label,
	sentence_label,
}: {
	label: string;
	sentence_label: string;
}) =>
	({
		area: "invoices",
		label,
		sentence_label,
		scope: Scopes.Billing.Write,
		when: "invoice",
	}) as const satisfies ActionDefinition;

export const ACTIONS = {
	"billing.attach": billingChangeAction({ label: "Attach" }),
	"billing.update_subscription": billingChangeAction({
		label: "Update subscription",
	}),
	"billing.set_plans": billingChangeAction({ label: "Set plans" }),
	"billing.schedule": billingChangeAction({ label: "Schedule" }),
	"billing.cancel": billingCancelAction({ label: "Cancel" }),
	"billing.uncancel": billingCancelAction({ label: "Uncancel" }),

	"invoices.create": invoiceAction({
		label: "Create",
		sentence_label: "Create invoices",
	}),
	"invoices.finalize": invoiceAction({
		label: "Finalize",
		sentence_label: "Finalize invoices",
	}),
	"invoices.pay": invoiceAction({
		label: "Pay",
		sentence_label: "Pay invoices",
	}),
	"invoices.void": invoiceAction({
		label: "Void",
		sentence_label: "Void invoices",
	}),
	"invoices.update": invoiceAction({
		label: "Update",
		sentence_label: "Update invoices",
	}),
	"invoices.reissue": invoiceAction({
		label: "Reissue",
		sentence_label: "Reissue invoices",
	}),
	"invoices.credit_note": invoiceAction({
		label: "Credit note",
		sentence_label: "Issue credit notes",
	}),

	"balances.create": {
		area: "balances",
		label: "Grant credits",
		scope: Scopes.Balances.Write,
		when: "balance_create",
	},
	"balances.update": {
		area: "balances",
		label: "Set balance",
		scope: Scopes.Balances.Write,
		when: "balance_update",
	},

	"rewards.create": {
		area: "rewards",
		label: "Create reward",
		scope: Scopes.Rewards.Write,
		when: null,
	},
	"rewards.apply": {
		area: "rewards",
		label: "Apply reward",
		scope: Scopes.Rewards.Write,
		when: "reward_apply",
	},

	"customers.create": {
		area: "customers",
		label: "Create",
		sentence_label: "Create customers",
		scope: Scopes.Customers.Write,
		when: null,
	},
	"customers.update": {
		area: "customers",
		label: "Update",
		sentence_label: "Update customers",
		scope: Scopes.Customers.Write,
		when: "customer",
	},
	"customers.delete": {
		area: "customers",
		label: "Delete",
		sentence_label: "Delete customers",
		scope: Scopes.Customers.Write,
		when: "customer",
	},

	"catalog.edit_plans": {
		area: "catalog",
		label: "Edit plans",
		scope: Scopes.Plans.Write,
		when: "catalog_plan",
	},
	"catalog.edit_features": {
		area: "catalog",
		label: "Edit features",
		scope: Scopes.Features.Write,
		when: "catalog_feature",
	},

	"api_keys.create": {
		area: "api_keys",
		label: "Create",
		sentence_label: "Create API keys",
		scope: Scopes.ApiKeys.Write,
		when: null,
	},

	"migrations.create": {
		area: "migrations",
		label: "Create",
		sentence_label: "Create migrations",
		scope: Scopes.Migrations.Write,
		when: null,
	},
	"migrations.run": {
		area: "migrations",
		label: "Run",
		sentence_label: "Run migrations",
		scope: Scopes.Migrations.Write,
		when: null,
	},

	"members.invite": {
		area: "members",
		label: "Invite",
		sentence_label: "Invite members",
		scope: Scopes.Organisation.Write,
		when: null,
	},
	"members.change_role": {
		area: "members",
		label: "Change role",
		sentence_label: "Change member roles",
		scope: Scopes.Organisation.Write,
		when: null,
	},
} as const satisfies Record<string, ActionDefinition>;

export type ApprovalAction = keyof typeof ACTIONS;

export const ApprovalActionSchema = z.enum(
	Object.keys(ACTIONS) as [ApprovalAction, ...ApprovalAction[]],
);
