import type { ApprovalAction } from "@autumn/shared";

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
	issueCreditNote: "invoices.credit_note",
	createReward: "rewards.create",
	applyReward: "rewards.apply",
	createCustomer: "customers.create",
	editCustomer: "customers.update",
	deleteCustomer: "customers.delete",
	editPlans: "catalog.edit_plans",
	editFeatures: "catalog.edit_features",
	createApiKey: "api_keys.create",
	createMigration: "migrations.create",
	runMigration: "migrations.run",
} as const satisfies Record<string, ApprovalAction>;
