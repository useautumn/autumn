import { type ScopeString, Scopes } from "@utils/scopeDefinitions";
import { z } from "zod/v4";
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
	/** Coarse scope that allows this action when no rule covers it. */
	scope: ScopeString;
	/** Which `when` fields a rule on this action can use; null = who-only. */
	when: WhenKey | null;
};

const billingAction = ({
	label,
	when,
}: {
	label: string;
	when: WhenKey;
}): ActionDefinition => ({
	area: "billing",
	label,
	scope: Scopes.Billing.Write,
	when,
});

const invoiceAction = ({ label }: { label: string }): ActionDefinition => ({
	area: "invoices",
	label,
	scope: Scopes.Billing.Write,
	when: "invoice",
});

export const ACTIONS = {
	"billing.attach": billingAction({ label: "Attach", when: "billing_change" }),
	"billing.update_subscription": billingAction({
		label: "Update subscription",
		when: "billing_change",
	}),
	"billing.set_plans": billingAction({
		label: "Set plans",
		when: "billing_change",
	}),
	"billing.schedule": billingAction({
		label: "Schedule",
		when: "billing_change",
	}),
	"billing.cancel": billingAction({ label: "Cancel", when: "billing_cancel" }),
	"billing.uncancel": billingAction({
		label: "Uncancel",
		when: "billing_cancel",
	}),

	"invoices.create": invoiceAction({ label: "Create" }),
	"invoices.finalize": invoiceAction({ label: "Finalize" }),
	"invoices.pay": invoiceAction({ label: "Pay" }),
	"invoices.void": invoiceAction({ label: "Void" }),
	"invoices.update": invoiceAction({ label: "Update" }),
	"invoices.reissue": invoiceAction({ label: "Reissue" }),
	"invoices.credit_note": invoiceAction({ label: "Credit note" }),

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
		scope: Scopes.Customers.Write,
		when: null,
	},
	"customers.update": {
		area: "customers",
		label: "Update",
		scope: Scopes.Customers.Write,
		when: "customer",
	},
	"customers.delete": {
		area: "customers",
		label: "Delete",
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
		scope: Scopes.ApiKeys.Write,
		when: null,
	},

	"migrations.create": {
		area: "migrations",
		label: "Create",
		scope: Scopes.Migrations.Write,
		when: null,
	},
	"migrations.run": {
		area: "migrations",
		label: "Run",
		scope: Scopes.Migrations.Write,
		when: null,
	},

	"members.invite": {
		area: "members",
		label: "Invite",
		scope: Scopes.Organisation.Write,
		when: null,
	},
	"members.change_role": {
		area: "members",
		label: "Change role",
		scope: Scopes.Organisation.Write,
		when: null,
	},
} as const satisfies Record<string, ActionDefinition>;

export type ApprovalAction = keyof typeof ACTIONS;

export const ApprovalActionSchema = z.enum(
	Object.keys(ACTIONS) as [ApprovalAction, ...ApprovalAction[]],
);
