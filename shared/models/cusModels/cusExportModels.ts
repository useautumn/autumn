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

export const CustomerExportSnapshotSchema = z.object({
	search: z.string().default(""),
	filters: CustomerListFiltersSchema.default({}),
});

export type CustomerExportSnapshot = z.infer<
	typeof CustomerExportSnapshotSchema
>;
