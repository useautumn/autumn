import {
	type AutoTopup,
	type BillingAutoTopupFailedError,
	type BillingAutoTopupFailureReason,
	type BillingAutoTopupSucceededInvoice,
	type BillingResult,
	ErrCode,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	fullCustomerToTags,
	getApiBalance,
	WebhookEventType,
} from "@autumn/shared";
import type Stripe from "stripe";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import type { AutoTopupContext } from "../autoTopupContext.js";

const getInvoicePayload = ({
	billingResult,
	stripeInvoice,
}: {
	billingResult?: BillingResult;
	stripeInvoice?: Stripe.Invoice;
}): BillingAutoTopupSucceededInvoice | null => {
	const invoice = stripeInvoice ?? billingResult?.stripe.stripeInvoice;
	if (!invoice) return null;

	return {
		stripe_id: invoice.id,
		status: invoice.status,
		total: invoice.total,
		currency: invoice.currency,
		hosted_invoice_url: invoice.hosted_invoice_url,
	};
};

const getErrorPayload = ({
	error,
	message,
}: {
	error?: unknown;
	message?: string;
}): BillingAutoTopupFailedError | undefined => {
	const err = error as
		| {
				code?: string;
				message?: string;
				type?: string;
				decline_code?: string;
				raw?: {
					code?: string;
					message?: string;
					type?: string;
					decline_code?: string;
				};
		  }
		| undefined;

	const payload = {
		code: err?.code ?? err?.raw?.code ?? null,
		message: message ?? err?.message ?? err?.raw?.message ?? null,
		type: err?.type ?? err?.raw?.type ?? null,
		decline_code: err?.decline_code ?? err?.raw?.decline_code ?? null,
	};

	if (
		!payload.code &&
		!payload.message &&
		!payload.type &&
		!payload.decline_code
	) {
		return undefined;
	}

	return payload;
};

const getBalance = ({
	ctx,
	fullCustomer,
	featureId,
}: {
	ctx: AutumnContext;
	fullCustomer?: FullCustomer;
	featureId: string;
}): number | null => {
	if (!fullCustomer) return null;

	const feature = ctx.features.find((feature) => feature.id === featureId);
	if (!feature) return null;

	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});
	if (customerEntitlements.length === 0) return null;

	const { data: balance } = getApiBalance({
		ctx,
		fullCus: fullCustomer,
		cusEnts: customerEntitlements,
		feature,
	});

	return balance.remaining;
};

export const sendAutoTopupFailedWebhook = async ({
	ctx,
	customerId,
	featureId,
	reason,
	retryable,
	message,
	error,
	autoTopupContext,
	fullCustomer,
	autoTopupConfig,
	billingResult,
	stripeInvoice,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
	reason: BillingAutoTopupFailureReason;
	retryable: boolean;
	message?: string;
	error?: unknown;
	autoTopupContext?: AutoTopupContext;
	fullCustomer?: FullCustomer;
	autoTopupConfig?: AutoTopup;
	billingResult?: BillingResult;
	stripeInvoice?: Stripe.Invoice;
}) => {
	try {
		const customer = autoTopupContext?.fullCustomer ?? fullCustomer;
		const config = autoTopupContext?.autoTopupConfig ?? autoTopupConfig;
		const invoice = getInvoicePayload({ billingResult, stripeInvoice });
		const errorPayload = getErrorPayload({ error, message });
		let balance: number | null = null;
		try {
			balance = getBalance({ ctx, fullCustomer: customer, featureId });
		} catch (balanceError) {
			ctx.logger.warn(
				`[sendAutoTopupFailedWebhook] Failed to derive balance: ${balanceError}`,
				{ error: balanceError },
			);
		}

		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.BillingAutoTopupFailed,
			payloadFields: {
				id: generateId("evt_auto_topup_failed"),
				occurred_at: Date.now(),
			},
			data: {
				customer_id: customerId,
				feature_id: featureId,
				reason,
				retryable,
				quantity: config?.quantity ?? null,
				threshold: config?.threshold ?? null,
				balance,
				invoice_mode: autoTopupContext
					? Boolean(autoTopupContext.invoiceMode)
					: null,
				invoice,
				error: errorPayload,
			},
			tags: customer
				? fullCustomerToTags({
						fullCustomer: customer,
					})
				: undefined,
		});
	} catch (webhookError) {
		ctx.logger.error(
			`[sendAutoTopupFailedWebhook] Failed to send webhook: ${webhookError}`,
			{ error: webhookError },
		);
	}
};

export const classifyAutoTopupError = ({
	error,
}: {
	error: unknown;
}): {
	reason: BillingAutoTopupFailureReason;
	retryable: boolean;
	message?: string;
} => {
	const err = error as { code?: string; message?: string };

	if (err?.code === ErrCode.LockAlreadyExists) {
		return {
			reason: "lock_contention",
			retryable: true,
			message: err.message,
		};
	}

	if (
		err?.code === ErrCode.PayInvoiceFailed ||
		err?.code === ErrCode.StripeCardDeclined ||
		err?.code === "card_declined"
	) {
		return {
			reason: "charge_failed",
			retryable: false,
			message: err.message,
		};
	}

	if (err?.message?.includes("[computeAutoTopupPlan] Calculated amount")) {
		return {
			reason: "invalid_amount",
			retryable: false,
			message: err.message,
		};
	}

	return {
		reason: "execution_error",
		retryable: true,
		message: err?.message,
	};
};
