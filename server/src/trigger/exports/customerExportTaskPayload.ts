import {
	AppEnv,
	CustomerExportFieldsSchema,
	CustomerExportSnapshotSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

export const CustomerExportPartitionSchema = z.object({
	partNumber: z.number().int().min(1),
	upperInternalId: z.string().nullable(),
	lowerInternalId: z.string().nullable(),
});

export const RunCustomerExportPayloadSchema = z.object({
	exportId: z.string(),
	orgId: z.string(),
	env: z.enum(AppEnv),
});

export type RunCustomerExportPayload = z.infer<
	typeof RunCustomerExportPayloadSchema
>;

export const RunCustomerExportWorkerPayloadSchema = z.object({
	exportId: z.string(),
	orgId: z.string(),
	env: z.enum(AppEnv),
	range: CustomerExportPartitionSchema,
	fields: CustomerExportFieldsSchema,
	snapshot: CustomerExportSnapshotSchema,
	s3Key: z.string(),
	s3UploadId: z.string(),
});

export type RunCustomerExportWorkerPayload = z.infer<
	typeof RunCustomerExportWorkerPayloadSchema
>;

export type CustomerExportWorkerResult = {
	partNumber: number;
	eTag: string;
	rowCount: number;
	byteCount: number;
};
