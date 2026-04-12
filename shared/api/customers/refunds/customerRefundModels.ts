import { createPagePaginatedResponseSchema } from "@api/common/pagePaginationSchemas";
import { z } from "zod/v4";

export const RefundSourceTypeSchema = z.enum([
	"invoice",
	"payment_intent",
	"checkout_session",
	"subscription",
	"direct_charge",
]);

export const RefundModeSchema = z.enum(["full", "custom"]);

export const RefundReasonSchema = z.enum([
	"requested_by_customer",
	"duplicate",
	"fraudulent",
]);

export const RefundableChargeRowSchema = z.object({
	id: z.string(),
	chargeId: z.string(),
	createdAt: z.number(),
	currency: z.string(),
	amountPaid: z.number(),
	refundedAmount: z.number(),
	refundableAmount: z.number(),
	sourceType: RefundSourceTypeSchema,
	sourceLabel: z.string(),
	paymentIntentId: z.string().nullable(),
	invoiceId: z.string().nullable(),
	checkoutSessionId: z.string().nullable(),
	subscriptionId: z.string().nullable(),
	productNames: z.array(z.string()),
	description: z.string().nullable(),
	stripeUrl: z.string().nullable(),
});

export const ListRefundableChargesResponseSchema =
	createPagePaginatedResponseSchema(RefundableChargeRowSchema);

export const CustomerRefundParamsSchema = z.object({
	charge_ids: z.array(z.string()).min(1),
	mode: RefundModeSchema,
	amounts_by_charge_id: z.record(z.string(), z.number()).optional(),
	reason: RefundReasonSchema.optional(),
});

export const RefundPreviewChargeSchema = RefundableChargeRowSchema.extend({
	refundAmount: z.number(),
});

export const CustomerRefundPreviewResponseSchema = z.object({
	charges: z.array(RefundPreviewChargeSchema),
	summary: z.object({
		currency: z.string(),
		chargeCount: z.number().int(),
		refundCount: z.number().int(),
		totalPaidAmount: z.number(),
		totalRefundedAmount: z.number(),
		totalRefundableAmount: z.number(),
		totalRefundAmount: z.number(),
	}),
	mode: RefundModeSchema,
	reason: RefundReasonSchema.nullable(),
});

export const CustomerRefundExecutionResultSchema = z.object({
	chargeId: z.string(),
	refundId: z.string().nullable(),
	currency: z.string(),
	amount: z.number(),
	status: z.enum(["succeeded", "failed"]),
	errorMessage: z.string().nullable(),
});

export const CustomerRefundResponseSchema =
	CustomerRefundPreviewResponseSchema.extend({
		refunds: z.array(CustomerRefundExecutionResultSchema),
	});

export type RefundSourceType = z.infer<typeof RefundSourceTypeSchema>;
export type RefundMode = z.infer<typeof RefundModeSchema>;
export type RefundReason = z.infer<typeof RefundReasonSchema>;
export type RefundableChargeRow = z.infer<typeof RefundableChargeRowSchema>;
export type ListRefundableChargesResponse = z.infer<
	typeof ListRefundableChargesResponseSchema
>;
export type CustomerRefundParams = z.infer<typeof CustomerRefundParamsSchema>;
export type RefundPreviewCharge = z.infer<typeof RefundPreviewChargeSchema>;
export type CustomerRefundPreviewResponse = z.infer<
	typeof CustomerRefundPreviewResponseSchema
>;
export type CustomerRefundExecutionResult = z.infer<
	typeof CustomerRefundExecutionResultSchema
>;
export type CustomerRefundResponse = z.infer<
	typeof CustomerRefundResponseSchema
>;
