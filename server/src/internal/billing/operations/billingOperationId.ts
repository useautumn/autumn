import { z } from "zod/v4";

const BILLING_OPERATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const BILLING_OPERATION_ID_MAX_LENGTH = 255;

const BillingOperationIdSchema = z
	.string()
	.min(1)
	.max(BILLING_OPERATION_ID_MAX_LENGTH)
	.regex(BILLING_OPERATION_ID_PATTERN, {
		message:
			"operation ID may only contain letters, digits, '.', '_', ':' and '-'",
	})
	.brand<"BillingOperationId">();

export type BillingOperationId = z.infer<typeof BillingOperationIdSchema>;

export const parseBillingOperationId = (value: unknown): BillingOperationId =>
	BillingOperationIdSchema.parse(value);
