import {
	type AutoTopupJobPayload,
	subjectToAutoTopupObjects,
} from "@autumn/auto-topup";
import {
	type AutoTopup,
	type BillingAutoTopupFailureReason,
	BillingVersion,
	cusEntToCusPrice,
	cusProductToProduct,
	customerPriceToBillingUnits,
	type FullCustomer,
	fullCustomerToFullSubject,
	roundUsageToNearestBillingUnit,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillableFullCustomer } from "@/internal/balances/getBillableFullCustomer.js";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling.js";
import {
	hasRoomForExpiringGrant,
	isExpiringPurchase,
} from "@/internal/billing/v2/utils/expiringGrants/hasRoomForExpiringGrant.js";
import type { AutoTopupContext } from "../autoTopupContext.js";
import { preflightAutoTopupLimits } from "../helpers/limits/preflightAutoTopupLimits.js";

export type AutoTopupSetupFailure = {
	reason: BillingAutoTopupFailureReason;
	message: string;
	fullCustomer?: FullCustomer;
	autoTopupConfig?: AutoTopup;
	suppressionKey?: string;
	suppressionTtlMs?: number;
};

export type SetupAutoTopupContextResult =
	| { ok: true; autoTopupContext: AutoTopupContext }
	| { ok: false; failure?: AutoTopupSetupFailure };

/** Fetch full customer, auto-topup config, cusEnt, and Stripe context. */
export const setupAutoTopupContext = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: AutoTopupJobPayload;
}): Promise<SetupAutoTopupContextResult> => {
	const { logger } = ctx;
	const { customerId, featureId } = payload;

	// 1. Fetch FullCustomer with rollout-aware cache source:
	//    - FullSubject cache when rollout is enabled for this customer bucket.
	//    - Legacy FullCustomer cache otherwise.
	const fullCustomer = await getBillableFullCustomer({
		ctx,
		customerId,
		source: "setupAutoTopupContext",
	});

	if (!fullCustomer?.processor?.id) {
		const message = `Customer ${customerId} not found or no Stripe customer ID, skipping`;
		logger.warn(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: "customer_unavailable",
				message,
				fullCustomer,
			},
		};
	}

	// 2. Extract auto-topup objects (config, cusEnt) from fullCustomer
	const resolved = subjectToAutoTopupObjects({
		fullSubject: fullCustomerToFullSubject({ fullCustomer }),
		featureId,
		now: Date.now(),
	});

	if (!resolved) {
		const message = `No enabled auto top-up configuration or chargeable prepaid entitlement for feature ${featureId}, customer ${customerId}, skipping`;
		ctx.logger.info(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: "configuration_unavailable",
				message,
				fullCustomer,
			},
		};
	}

	if (!resolved.balanceBelowThreshold) {
		const message = `Balance not below threshold for feature ${featureId}, customer ${customerId}, skipping`;
		ctx.logger.info(`[setupAutoTopupContext] ${message}`, {
			data: resolved,
		});
		return { ok: false };
	}

	const { autoTopupConfig, customerEntitlement } = resolved;
	const customerPrice = cusEntToCusPrice({
		cusEnt: customerEntitlement,
		errorOnNotFound: true,
	});

	const billingUnits = customerPriceToBillingUnits({ customerPrice });
	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: autoTopupConfig.quantity,
		billingUnits,
	});
	const normalizedAutoTopupConfig = {
		...autoTopupConfig,
		quantity: roundedQuantity,
	};

	if (
		isExpiringPurchase({ customerEntitlement }) &&
		!hasRoomForExpiringGrant({ fullCustomer, now: Date.now() })
	) {
		const message = `Customer ${customerId} already holds the maximum number of loose balances; an expiring top-up for feature ${featureId} would not be visible, skipping`;
		logger.warn(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: "grant_limit_reached",
				message,
				fullCustomer,
				autoTopupConfig: normalizedAutoTopupConfig,
				suppressionKey: [
					"auto_topup_failed_webhook",
					ctx.org.id,
					ctx.env,
					customerId,
					featureId,
					"grant_limit_reached",
				].join(":"),
				suppressionTtlMs: 24 * 60 * 60 * 1000,
			},
		};
	}

	const vercelInstallationId = fullCustomer.processors?.vercel?.installation_id;
	const shouldUseInvoiceMode =
		autoTopupConfig.invoice_mode === true || Boolean(vercelInstallationId);

	const invoiceMode = shouldUseInvoiceMode
		? { finalizeInvoice: true, enableProductImmediately: true }
		: undefined;

	// Fetched before the preflight because the circuit breaker needs the current
	// payment method to tell "same declining card" from "new payment info".
	const { stripeCus, paymentMethod, testClockFrozenTime } =
		await fetchStripeCustomerForBilling({ ctx, fullCus: fullCustomer });

	if (!paymentMethod && !invoiceMode) {
		const message = `No payment method for customer ${stripeCus?.id}, skipping`;
		logger.warn(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: "missing_payment_method",
				message,
				fullCustomer,
				autoTopupConfig: normalizedAutoTopupConfig,
			},
		};
	}

	const { allowed, reason, blockedWindowEndsAt, limitState } =
		await preflightAutoTopupLimits({
			ctx,
			payload,
			fullCustomer,
			autoTopupConfig: normalizedAutoTopupConfig,
			paymentMethod,
		});

	if (!allowed) {
		const message = `Preflight blocked for feature ${featureId}, customer ${customerId}, reason: ${reason}`;
		logger.info(`[setupAutoTopupContext] ${message}`);

		// Suspension has no window to expire, so key the suppression off when the
		// breaker tripped — one webhook a day rather than one per deduction.
		if (reason === "suspended_after_failures") {
			return {
				ok: false,
				failure: {
					reason,
					message,
					fullCustomer,
					autoTopupConfig: normalizedAutoTopupConfig,
					suppressionKey: [
						"auto_topup_failed_webhook",
						ctx.org.id,
						ctx.env,
						customerId,
						featureId,
						reason,
						limitState.suspended_at,
					].join(":"),
					suppressionTtlMs: 24 * 60 * 60 * 1000,
				},
			};
		}

		return {
			ok: false,
			failure: {
				reason: reason ?? "execution_error",
				message,
				fullCustomer,
				autoTopupConfig: normalizedAutoTopupConfig,
				...(reason && blockedWindowEndsAt
					? {
							suppressionKey: [
								"auto_topup_failed_webhook",
								ctx.org.id,
								ctx.env,
								customerId,
								featureId,
								reason,
								blockedWindowEndsAt,
							].join(":"),
							suppressionTtlMs: Math.max(
								blockedWindowEndsAt - Date.now(),
								60_000,
							),
						}
					: {}),
			},
		};
	}

	const currentEpochMs = testClockFrozenTime ?? Date.now();

	const cusProduct = customerEntitlement.customer_product;

	if (!cusProduct) {
		const message = `No customer product found for customer ${customerId}`;
		logger.error(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: "missing_customer_product",
				message,
				fullCustomer,
				autoTopupConfig: normalizedAutoTopupConfig,
			},
		};
	}

	return {
		ok: true,
		autoTopupContext: {
			// BillingContext fields
			fullCustomer,
			fullProducts: [cusProductToProduct({ cusProduct })],
			featureQuantities: [],
			invoiceMode,
			currentEpochMs,
			billingCycleAnchorMs: "now",
			resetCycleAnchorMs: "now",
			stripeCustomer: stripeCus,
			paymentMethod,
			billingVersion: BillingVersion.V2,

			// Auto top-up specific fields
			autoTopupConfig: normalizedAutoTopupConfig,
			customerEntitlement,

			limitState,
		},
	};
};
