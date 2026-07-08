import {
	type AutoTopup,
	type BillingAutoTopupFailedError,
	type BillingAutoTopupFailureReason,
	ErrCode,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	fullCustomerToTags,
	getApiBalance,
	WebhookEventType,
} from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import type { AutoTopupContext } from "../autoTopupContext.js";

const shouldEmitSuppressedWebhook = async ({
	ctx,
	suppressionKey,
	suppressionTtlMs,
}: {
	ctx: AutumnContext;
	suppressionKey?: string;
	suppressionTtlMs?: number;
}): Promise<boolean> => {
	if (!suppressionKey || !suppressionTtlMs || suppressionTtlMs <= 0) {
		return true;
	}

	if (redis.status !== "ready") {
		ctx.logger.warn(
			`[sendAutoTopupFailedWebhook] Redis unavailable, cannot suppress duplicate webhook for ${suppressionKey}`,
		);
		return true;
	}

	try {
		const ttlSeconds = Math.max(1, Math.ceil(suppressionTtlMs / 1000));
		const result = await redis.set(suppressionKey, "1", "EX", ttlSeconds, "NX");
		if (result === "OK") return true;

		ctx.logger.info(
			`[sendAutoTopupFailedWebhook] Suppressing duplicate webhook for ${suppressionKey}`,
		);
		return false;
	} catch (error) {
		ctx.logger.warn(
			`[sendAutoTopupFailedWebhook] Failed to check suppression key ${suppressionKey}: ${error}`,
			{ error },
		);
		return true;
	}
};

const releaseSuppressionKey = async ({
	ctx,
	suppressionKey,
}: {
	ctx: AutumnContext;
	suppressionKey: string;
}): Promise<void> => {
	if (redis.status !== "ready") return;
	try {
		await redis.del(suppressionKey);
	} catch (error) {
		ctx.logger.warn(
			`[sendAutoTopupFailedWebhook] Failed to release suppression key ${suppressionKey}: ${error}`,
		);
	}
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
		message: message ?? null,
		type: err?.type ?? err?.raw?.type ?? null,
		decline_code: err?.decline_code ?? err?.raw?.decline_code ?? null,
	};

	if (!payload.code && !payload.type && !payload.decline_code) {
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
	suppressionKey,
	suppressionTtlMs,
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
	suppressionKey?: string;
	suppressionTtlMs?: number;
}) => {
	try {
		const shouldEmit = await shouldEmitSuppressedWebhook({
			ctx,
			suppressionKey,
			suppressionTtlMs,
		});
		if (!shouldEmit) return;

		const customer = autoTopupContext?.fullCustomer ?? fullCustomer;
		const config = autoTopupContext?.autoTopupConfig ?? autoTopupConfig;
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

		const sent = await sendSvixEvent({
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
				error: errorPayload,
			},
			tags: customer
				? fullCustomerToTags({
						fullCustomer: customer,
					})
				: undefined,
			idempotencyKey: suppressionKey,
		});

		if (suppressionKey && !sent) {
			await releaseSuppressionKey({ ctx, suppressionKey });
		}
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
			message:
				"Another billing operation is already in progress for this customer.",
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
			message: "The auto top-up payment could not be completed.",
		};
	}

	if (err?.message?.includes("[computeAutoTopupPlan] Calculated amount")) {
		return {
			reason: "invalid_amount",
			retryable: false,
			message: "The calculated auto top-up amount was invalid.",
		};
	}

	return {
		reason: "execution_error",
		retryable: true,
		message: "An unexpected error occurred while processing the auto top-up.",
	};
};
