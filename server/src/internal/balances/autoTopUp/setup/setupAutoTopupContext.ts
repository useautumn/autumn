import {
	ACTIVE_STATUSES,
	type AutoTopup,
	type BillingAutoTopupFailureReason,
	BillingVersion,
	cusEntToCusPrice,
	cusProductToProduct,
	customerPriceToBillingUnits,
	type FullCustomer,
	fullSubjectToFullCustomer,
	roundUsageToNearestBillingUnit,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import type { AutoTopUpPayload } from "@/queue/workflows.js";
import type { AutoTopupContext } from "../autoTopupContext.js";
import { fullCustomerToAutoTopupObjects } from "../helpers/fullCustomerToAutoTopupObjects.js";
import { preflightAutoTopupLimits } from "../helpers/limits/preflightAutoTopupLimits.js";

export type AutoTopupSetupFailure = {
	reason: BillingAutoTopupFailureReason;
	retryable: boolean;
	message: string;
	fullCustomer?: FullCustomer;
	autoTopupConfig?: AutoTopup;
};

export type SetupAutoTopupContextResult =
	| { ok: true; autoTopupContext: AutoTopupContext }
	| { ok: false; failure?: AutoTopupSetupFailure };

const getAutoTopupFullCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<FullCustomer | undefined> => {
	if (isFullSubjectRolloutEnabled({ ctx })) {
		const { fullSubject: cachedFullSubject } = await getCachedFullSubject({
			ctx,
			customerId,
			source: "setupAutoTopupContext",
		});

		if (cachedFullSubject) {
			return fullSubjectToFullCustomer({
				fullSubject: cachedFullSubject,
			});
		}

		const normalizedFullSubject = await getFullSubjectNormalized({
			ctx,
			customerId,
			inStatuses: ACTIVE_STATUSES,
		});

		if (normalizedFullSubject) {
			return fullSubjectToFullCustomer({
				fullSubject: normalizedFullSubject.fullSubject,
			});
		}

		// Safety fallback to preserve previous behavior if subject query returns no row.
		return CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ACTIVE_STATUSES,
			withSubs: true,
		});
	}

	let fullCustomer = await getCachedFullCustomer({ ctx, customerId });

	if (!fullCustomer) {
		fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ACTIVE_STATUSES,
			withSubs: true,
		});
	}

	return fullCustomer;
};

/** Fetch full customer, auto-topup config, cusEnt, and Stripe context. */
export const setupAutoTopupContext = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: AutoTopUpPayload;
}): Promise<SetupAutoTopupContextResult> => {
	const { logger } = ctx;
	const { customerId, featureId } = payload;

	// 1. Fetch FullCustomer with rollout-aware cache source:
	//    - FullSubject cache when rollout is enabled for this customer bucket.
	//    - Legacy FullCustomer cache otherwise.
	const fullCustomer = await getAutoTopupFullCustomer({
		ctx,
		customerId,
	});

	if (!fullCustomer?.processor?.id) {
		const message = `Customer ${customerId} not found or no Stripe customer ID, skipping`;
		logger.warn(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: "customer_unavailable",
				retryable: false,
				message,
				fullCustomer,
			},
		};
	}

	// 2. Extract auto-topup objects (config, cusEnt) from fullCustomer
	const resolved = fullCustomerToAutoTopupObjects({
		fullCustomer,
		featureId,
	});

	if (!resolved) {
		const message = `No enabled auto top-up configuration or chargeable prepaid entitlement for feature ${featureId}, customer ${customerId}, skipping`;
		ctx.logger.info(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: "configuration_unavailable",
				retryable: false,
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

	const { allowed, reason, limitState } = await preflightAutoTopupLimits({
		ctx,
		payload,
		fullCustomer,
		autoTopupConfig: normalizedAutoTopupConfig,
	});

	if (!allowed) {
		const message = `Preflight blocked for feature ${featureId}, customer ${customerId}, reason: ${reason}`;
		logger.info(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: reason ?? "execution_error",
				retryable: false,
				message,
				fullCustomer,
				autoTopupConfig: normalizedAutoTopupConfig,
			},
		};
	}

	const vercelInstallationId =
		fullCustomer.processors?.vercel?.installation_id;
	const shouldUseInvoiceMode =
		autoTopupConfig.invoice_mode === true || Boolean(vercelInstallationId);

	const invoiceMode = shouldUseInvoiceMode
		? { finalizeInvoice: true, enableProductImmediately: true }
		: undefined;

	const { stripeCus, paymentMethod, testClockFrozenTime } =
		await fetchStripeCustomerForBilling({ ctx, fullCus: fullCustomer });

	if (!paymentMethod && !invoiceMode) {
		const message = `No payment method for customer ${stripeCus?.id}, skipping`;
		logger.warn(`[setupAutoTopupContext] ${message}`);
		return {
			ok: false,
			failure: {
				reason: "missing_payment_method",
				retryable: false,
				message,
				fullCustomer,
				autoTopupConfig: normalizedAutoTopupConfig,
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
				retryable: false,
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
