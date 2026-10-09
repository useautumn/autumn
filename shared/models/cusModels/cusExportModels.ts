import { z } from "zod/v4";
import { CustomerListFiltersSchema } from "../../api/customers/customerListFilters.js";

export const CustomerExportStatus = {
	Queued: "queued",
	Running: "running",
	Completed: "completed",
	Failed: "failed",
} as const;

export type CustomerExportStatus =
	(typeof CustomerExportStatus)[keyof typeof CustomerExportStatus];

export const ACTIVE_CUSTOMER_EXPORT_STATUSES = [
	CustomerExportStatus.Queued,
	CustomerExportStatus.Running,
] as const;

export const isCustomerExportActive = (customerExport: {
	status: CustomerExportStatus;
}) =>
	ACTIVE_CUSTOMER_EXPORT_STATUSES.some(
		(status) => status === customerExport.status,
	);

export const CustomerExportKind = {
	Customers: "customers",
	BillingVerify: "billing_verify",
	CustomPlans: "custom_plans",
} as const;

export type CustomerExportKind =
	(typeof CustomerExportKind)[keyof typeof CustomerExportKind];

export const CustomerExportKindSchema = z.enum(CustomerExportKind);

export const CustomerExportField = {
	Name: "name",
	Email: "email",
	CustomerId: "customer_id",
	Subscriptions: "subscriptions",
	Purchases: "purchases",
	Licenses: "licenses",
} as const;

export type CustomerExportField =
	(typeof CustomerExportField)[keyof typeof CustomerExportField];

/** Canonical CSV column order — the serializer ignores user selection order. */
export const CUSTOMER_EXPORT_FIELD_ORDER = [
	CustomerExportField.Name,
	CustomerExportField.Email,
	CustomerExportField.CustomerId,
	CustomerExportField.Subscriptions,
	CustomerExportField.Purchases,
	CustomerExportField.Licenses,
] as const;

export const CUSTOMER_EXPORT_FIELD_HEADERS: Record<
	CustomerExportField,
	string
> = {
	[CustomerExportField.Name]: "Name",
	[CustomerExportField.Email]: "Email",
	[CustomerExportField.CustomerId]: "Customer ID",
	[CustomerExportField.Subscriptions]: "Plans",
	[CustomerExportField.Purchases]: "Purchases",
	[CustomerExportField.Licenses]: "Licenses",
};

export const CustomerExportStatusSchema = z.enum(CustomerExportStatus);

export const CustomerExportFieldSchema = z.enum(CustomerExportField);

export const CustomerExportFieldsSchema = z
	.array(CustomerExportFieldSchema)
	.min(1)
	.max(CUSTOMER_EXPORT_FIELD_ORDER.length)
	.refine((fields) => new Set(fields).size === fields.length, {
		message: "Export fields must be unique",
	});

export const CustomerExportScopeSchema = z.object({
	search: z.string().default(""),
	filters: CustomerListFiltersSchema.default({}),
});

export type CustomerExportScope = z.infer<typeof CustomerExportScopeSchema>;

export const BillingVerifyExportSnapshotSchema =
	CustomerExportScopeSchema.extend({
		include_unlinked_stripe_customers: z.boolean().default(false),
	});

export const CustomersExportSpecSchema = z.object({
	kind: z.literal(CustomerExportKind.Customers),
	fields: CustomerExportFieldsSchema,
	snapshot: CustomerExportScopeSchema,
});

export const BillingVerifyExportSpecSchema = z.object({
	kind: z.literal(CustomerExportKind.BillingVerify),
	fields: z.array(CustomerExportFieldSchema).max(0).default([]),
	snapshot: BillingVerifyExportSnapshotSchema,
});

export const CustomPlansExportSpecSchema = z.object({
	kind: z.literal(CustomerExportKind.CustomPlans),
	fields: z.array(CustomerExportFieldSchema).max(0).default([]),
	snapshot: CustomerExportScopeSchema,
});

/** What an export produces; kind decides which fields and snapshot options apply. */
export const CustomerExportSpecSchema = z.discriminatedUnion("kind", [
	CustomersExportSpecSchema,
	BillingVerifyExportSpecSchema,
	CustomPlansExportSpecSchema,
]);

export type CustomerExportSpec = z.infer<typeof CustomerExportSpecSchema>;

export type CustomersExportSpec = z.infer<typeof CustomersExportSpecSchema>;

export type BillingVerifyExportSpec = z.infer<
	typeof BillingVerifyExportSpecSchema
>;

export type CustomPlansExportSpec = z.infer<typeof CustomPlansExportSpecSchema>;

export type CustomerExportSnapshot = CustomerExportSpec["snapshot"];

export const BILLING_VERIFY_EXPORT_COLUMNS = [
	{ key: "customer_id", header: "Customer ID" },
	{ key: "name", header: "Name" },
	{ key: "email", header: "Email" },
	{ key: "stripe_customer_id", header: "Stripe Customer ID" },
	{ key: "stripe_subscription_ids", header: "Stripe Subscription IDs" },
	{ key: "severity", header: "Severity" },
	{ key: "issues", header: "Issues" },
	{ key: "details", header: "Details" },
] as const;

/** One row per customer; list columns hold every mismatch, comma-separated. */
export type BillingVerifyExportRow = Record<
	(typeof BILLING_VERIFY_EXPORT_COLUMNS)[number]["key"],
	string | null
>;

export const CUSTOM_PLANS_EXPORT_COLUMNS = [
	{ key: "customer_id", header: "Customer ID" },
	{ key: "name", header: "Name" },
	{ key: "email", header: "Email" },
	{ key: "entity_id", header: "Entity ID" },
	{ key: "customer_product_id", header: "Customer Product ID" },
	{ key: "plan_id", header: "Plan ID" },
	{ key: "plan_version", header: "Plan Version" },
	{ key: "status", header: "Status" },
	{ key: "outcome", header: "Outcome" },
	{ key: "reasons", header: "Reasons" },
	{ key: "changes", header: "Changes" },
	{ key: "diff", header: "Diff JSON" },
] as const;

export type CustomPlansExportRow = Record<
	(typeof CUSTOM_PLANS_EXPORT_COLUMNS)[number]["key"],
	string | null
>;
