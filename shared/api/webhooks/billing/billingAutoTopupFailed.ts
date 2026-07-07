import { z } from "zod/v4";
import { BillingAutoTopupSucceededInvoiceSchema } from "./billingAutoTopupSucceeded.js";

export const BillingAutoTopupFailureReasonSchema = z
	.enum([
		"charge_failed",
		"purchase_limit_reached",
		"attempt_limit_reached",
		"failed_attempt_limit_reached",
		"org_disabled",
		"dry_run",
		"customer_unavailable",
		"configuration_unavailable",
		"balance_above_threshold",
		"missing_payment_method",
		"missing_customer_product",
		"invalid_amount",
		"lock_contention",
		"redis_unavailable",
		"execution_error",
	])
	.meta({
		description:
			"Machine-readable reason the automatic top-up did not grant balance.",
	});

export const BillingAutoTopupFailedErrorSchema = z.object({
	code: z.string().nullish().meta({
		description:
			"Machine-readable error code when one is available (for example, a Stripe or Autumn error code).",
	}),
	message: z.string().nullish().meta({
		description:
			"Sanitized error message with details about why the auto top-up failed.",
	}),
	type: z.string().nullish().meta({
		description: "Provider error type when one is available.",
	}),
	decline_code: z.string().nullish().meta({
		description: "Stripe decline code when the failure came from a card decline.",
	}),
});

export const BILLING_AUTO_TOPUP_FAILED_EXAMPLE = {
	customer_id: "cus_123",
	feature_id: "messages",
	reason: "charge_failed",
	retryable: false,
	quantity: 100,
	threshold: 20,
	balance: 15,
	invoice_mode: false,
	invoice: {
		stripe_id: "in_1A2B3C4D5E6F7G8H",
		status: "void",
		total: 1000,
		currency: "usd",
		hosted_invoice_url: "https://invoice.stripe.com/i/acct_123/test_456",
	},
	error: {
		code: "card_declined",
		message: "Your card was declined.",
		type: "card_error",
		decline_code: "generic_decline",
	},
};

export const BillingAutoTopupFailedSchema = z
	.object({
		customer_id: z.string().meta({
			description: "The ID of the customer whose auto top-up failed.",
		}),
		feature_id: z.string().meta({
			description: "The feature ID that Autumn attempted to auto top-up.",
		}),
		reason: BillingAutoTopupFailureReasonSchema,
		retryable: z.boolean().meta({
			description:
				"Whether retrying later may succeed without changing customer or billing configuration.",
		}),
		quantity: z.number().nullish().meta({
			description:
				"The normalized amount of balance Autumn attempted to grant, when a matching auto top-up config was available.",
		}),
		threshold: z.number().nullish().meta({
			description:
				"The configured balance threshold for the auto top-up, when available.",
		}),
		balance: z.number().nullish().meta({
			description:
				"The customer's remaining balance for the feature at the time the failure was detected, when available.",
		}),
		invoice_mode: z.boolean().nullish().meta({
			description:
				"Whether the auto top-up was configured to create a send_invoice invoice instead of auto-charging.",
		}),
		invoice: BillingAutoTopupSucceededInvoiceSchema.nullish().meta({
			description:
				"The invoice associated with the failed top-up attempt, when one was created.",
		}),
		error: BillingAutoTopupFailedErrorSchema.nullish().meta({
			description:
				"Sanitized provider or Autumn error metadata, when the failure came from an exception or declined charge.",
		}),
	})
	.meta({
		examples: [BILLING_AUTO_TOPUP_FAILED_EXAMPLE],
	});

export type BillingAutoTopupFailureReason = z.infer<
	typeof BillingAutoTopupFailureReasonSchema
>;
export type BillingAutoTopupFailed = z.infer<
	typeof BillingAutoTopupFailedSchema
>;
export type BillingAutoTopupFailedError = z.infer<
	typeof BillingAutoTopupFailedErrorSchema
>;
