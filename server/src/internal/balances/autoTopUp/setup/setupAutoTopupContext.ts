import {
	ACTIVE_STATUSES,
	BillingVersion,
	cusEntToCusPrice,
	cusProductToProduct,
	customerPriceToBillingUnits,
	roundUsageToNearestBillingUnit,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js";
import type { AutoTopUpPayload } from "@/queue/workflows.js";
import type { AutoTopupContext } from "../autoTopupContext.js";
import { fullCustomerToAutoTopupObjects } from "../helpers/fullCustomerToAutoTopupObjects.js";
import { preflightAutoTopupLimits } from "../helpers/limits/preflightAutoTopupLimits.js";

/** Fetch full customer, auto-topup config, cusEnt, and Stripe context. Returns null if any prerequisite is missing. */
export const setupAutoTopupContext = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: AutoTopUpPayload;
}): Promise<AutoTopupContext | null> => {
	const { logger } = ctx;
	const { customerId, featureId } = payload;

	// 1. Fetch FullCustomer — Redis cache first (has latest deducted balance), fall back to DB
	let fullCustomer = await getCachedFullCustomer({ ctx, customerId });

	if (!fullCustomer) {
		fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ACTIVE_STATUSES,
			withSubs: true,
		});
	}

	if (!fullCustomer?.processor?.id) {
		logger.warn(
			`[setupAutoTopupContext] Customer ${customerId} not found or no Stripe customer ID, skipping`,
		);
		return null;
	}

	// 2. Extract auto-topup objects (config, cusEnt) from fullCustomer
	const resolved = fullCustomerToAutoTopupObjects({
		fullCustomer,
		featureId,
	});

	if (!resolved?.balanceBelowThreshold) {
		ctx.logger.info(
			`[setupAutoTopupContext] balance not below threshold, skipping`,
			{
				data: resolved,
			},
		);
		return null;
	}

	const { autoTopupConfig, customerEntitlement, customerEntitlements } =
		resolved;
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
		logger.info(
			`[setupAutoTopupContext] Preflight blocked for feature ${featureId}, customer ${customerId}, reason: ${reason}`,
		);
		return null;
	}

	const { stripeCus, paymentMethod, testClockFrozenTime } =
		await fetchStripeCustomerForBilling({ ctx, fullCus: fullCustomer });

	if (!paymentMethod) {
		logger.warn(
			`[setupAutoTopupContext] No payment method for customer ${stripeCus?.id}, skipping`,
		);
		return null;
	}

	const currentEpochMs = testClockFrozenTime ?? Date.now();

	const cusProduct = customerEntitlement.customer_product;

	if (!cusProduct) {
		logger.error(
			`[setupAutoTopupContext] No customer product found for customer ${customerId}`,
		);
		return null;
	}

	const invoiceMode = autoTopupConfig.invoice_mode
		? { finalizeInvoice: true, enableProductImmediately: true }
		: undefined;

	return {
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
		customerEntitlements,

		limitState,
	};
};
