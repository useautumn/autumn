import type {
	CustomerRefundPreviewResponse,
	RefundableChargeRow,
	RefundMode,
	RefundReason,
} from "@autumn/shared";

export type { RefundableChargeRow, RefundMode, RefundReason };

export type RefundDialogStage = "list" | "refund";

export type RefundAmountsByChargeId = Record<string, string>;

export type RefundPreviewSummary = CustomerRefundPreviewResponse["summary"];
