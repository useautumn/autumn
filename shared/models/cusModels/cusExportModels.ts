import { z } from "zod/v4";
import type { CustomerListFilters } from "../../api/customers/customerListFilters.js";

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
	[CustomerExportField.Subscriptions]: "Subscriptions",
	[CustomerExportField.Purchases]: "Purchases",
	[CustomerExportField.Licenses]: "Licenses",
};

export const CustomerExportStatusSchema = z.enum([
	CustomerExportStatus.Queued,
	CustomerExportStatus.Running,
	CustomerExportStatus.Completed,
	CustomerExportStatus.Failed,
]);

export const CustomerExportFieldSchema = z.enum([
	CustomerExportField.Name,
	CustomerExportField.Email,
	CustomerExportField.CustomerId,
	CustomerExportField.Subscriptions,
	CustomerExportField.Purchases,
	CustomerExportField.Licenses,
]);

/** The dashboard filter state frozen at export-creation time. */
export type CustomerExportSnapshot = {
	search: string;
	filters: CustomerListFilters;
};

/** One [upper, lower) descending internal_id range owned by a single worker. */
export type CustomerExportPartition = {
	partNumber: number;
	/** Inclusive upper bound; the first partition's bound freezes the export set. */
	upperInternalId: string | null;
	/** Exclusive lower bound; null on the last partition (unbounded). */
	lowerInternalId: string | null;
};

export type CustomerExportPartitionPlan = {
	rowsPerWorker: number;
	partitions: CustomerExportPartition[];
};
