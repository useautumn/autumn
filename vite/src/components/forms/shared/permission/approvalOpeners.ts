import type { ApprovalActionId } from "./canDo";

/**
 * The action each dashboard opener is gated on through `useCanDo`.
 * Members invite and role changes go through better-auth and aren't enforced yet.
 */
export const APPROVAL_OPENERS = {
	createInvoice: "invoices.create",
	finalizeInvoice: "invoices.finalize",
	markInvoicePaid: "invoices.pay",
	voidInvoice: "invoices.void",
	reissueInvoice: "invoices.reissue",
	editInvoicePaymentMethods: "invoices.update",
	issueCreditNote: "invoices.issue_credit_note",
	createReward: "rewards.create",
	redeemReward: "rewards.redeem",
	createCustomer: "customers.get_or_create",
	editCustomer: "customers.update",
	deleteCustomer: "customers.delete",
	createPlan: "plans.create",
	updatePlan: "plans.update",
	deletePlan: "plans.delete",
	createFeature: "features.create",
	updateFeature: "features.update",
	deleteFeature: "features.delete",
	createApiKey: "api_keys.create",
	createMigration: "migrations.create",
	runMigration: "migrations.run",
} as const satisfies Record<string, ApprovalActionId>;
