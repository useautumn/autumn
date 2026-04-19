import {
	ACTIVE_STATUSES,
	BillingVersion,
	cusProductToProduct,
	type FullCustomer,
	fullSubjectToFullCustomer,
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

const getAutoTopupFullCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<FullCustomer | undefined> => {
	console.log("customerId", customerId);
	if (isFullSubjectRolloutEnabled({ ctx })) {
		const cachedFullSubject = await getCachedFullSubject({
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

	// 1. Fetch FullCustomer with rollout-aware cache source:
	//    - FullSubject cache when rollout is enabled for this customer bucket.
	//    - Legacy FullCustomer cache otherwise.
	const fullCustomer = await getAutoTopupFullCustomer({
		ctx,
		customerId,
	});

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

	const { autoTopupConfig, customerEntitlement } = resolved;

	const { allowed, reason, limitState } = await preflightAutoTopupLimits({
		ctx,
		payload,
		fullCustomer,
		autoTopupConfig,
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
		autoTopupConfig,
		customerEntitlement,

		limitState,
	};
};
