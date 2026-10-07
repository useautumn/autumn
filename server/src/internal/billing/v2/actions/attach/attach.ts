import {
	type AttachBillingContext,
	type AttachParamsV1,
	type BillingContextOverride,
	CheckoutAction,
} from "@autumn/shared";
import { ms } from "@shared/utils/common/unixUtils";
import { checkoutSessionLock } from "@/external/redis/actions/checkoutSessionLock/checkoutSessionLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachPlan } from "@/internal/billing/v2/actions/attach/compute/computeAttachPlan";
import { handleAttachComputeErrors } from "@/internal/billing/v2/actions/attach/errors/handleAttachComputeErrors";
import { handleAttachV2Errors } from "@/internal/billing/v2/actions/attach/errors/handleAttachV2Errors";
import { logAttachContext } from "@/internal/billing/v2/actions/attach/logs/logAttachContext";
import { setupAttachBillingContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachBillingContext";
import { checkCheckoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkCheckoutSessionLock";
import {
	findPendingInvoiceConflict,
	listPendingCustomerProducts,
} from "@/internal/billing/v2/common/pendingInvoiceConflict/findPendingInvoiceConflict";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { publishBillingTransition } from "@/internal/billing/v2/publish/publishBillingTransition.js";
import { billingPlanToAutumnCheckout } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAutumnCheckout";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { resolveCarryOverUsagesParam } from "@/internal/billing/v2/utils/handleCarryOvers/resolveCarryOverUsagesParam";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { applyBillingDetailsForBilling } from "@/internal/billing/v2/utils/tax/applyBillingDetailsForBilling";
import { resolveTaxRateId } from "@/internal/billing/v2/utils/tax/resolveTaxRateId";
import { updateCheckoutDbAndCache } from "@/internal/checkouts/actions/updateDbAndCache";
import { preserveSubjectCache } from "@/internal/customers/cache/fullSubject/actions/preserveSubjectCache.js";
import { hashJson } from "@/utils/hash/hashJson";
import {
	type CreateAutumnCheckoutResult,
	createAutumnCheckout,
} from "../../common/createAutumnCheckout";

const LONG_LIVED_CHECKOUT_EXPIRY_MS = ms.days(90);

export async function attach({
	ctx,
	params,
	preview = false,
	skipAutumnCheckout = false,

	contextOverride,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	preview?: boolean;
	skipAutumnCheckout?: boolean;

	contextOverride?: BillingContextOverride;
}): Promise<CreateAutumnCheckoutResult<AttachBillingContext>> {
	const checkoutReservation =
		!preview && !skipAutumnCheckout
			? await checkoutSessionLock.get({
					ctx,
					customerId: params.customer_id,
				})
			: undefined;

	params = {
		...params,
		tax_rate_id: resolveTaxRateId({
			tax: params.tax,
			taxRateId: params.tax_rate_id,
		}),
		carry_over_usages: await resolveCarryOverUsagesParam({
			ctx,
			carryOverUsages: params.carry_over_usages,
		}),
	};

	// 1. Setup
	const billingContext = await setupAttachBillingContext({
		ctx,
		params,
		preview,
		contextOverride,
	});

	logAttachContext({ ctx, billingContext });

	// 2. Compute
	const autumnBillingPlan = computeAttachPlan({
		ctx,
		attachBillingContext: billingContext,
		params,
		hasFullCustomerOverride: Boolean(contextOverride?.fullCustomer),
	});

	logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });
	await handleAttachComputeErrors({
		ctx,
		billingContext,
		autumnBillingPlan,
		params,
	});

	// 3. Evaluate Stripe billing plan (handles checkout mode internally)
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});

	logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

	const billingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
	};

	// 4. Errors (requires full billing plan)
	await handleAttachV2Errors({
		ctx,
		billingContext,
		billingPlan,
		params,
		preview,
	});

	if (preview) {
		const previewBillingPlan = await computeAttachPreviewBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});

		return {
			billingContext,
			billingPlan: { ...billingPlan, preview: previewBillingPlan },
		};
	}

	const shouldCreateLongLivedCheckout =
		params.long_lived_checkout &&
		billingContext.checkoutMode === "stripe_checkout" &&
		!skipAutumnCheckout;

	const autumnCheckoutParams = params.long_lived_checkout
		? { ...params, long_lived_checkout: false }
		: params;

	const arbitrateCheckoutLock = () =>
		checkCheckoutSessionLock({
			ctx,
			params: autumnCheckoutParams,
			billingContext,
			billingPlan,
			existingLock: checkoutReservation,
		});

	// 5. Checkout session lock (skip for confirm flows)
	if (!skipAutumnCheckout && !shouldCreateLongLivedCheckout) {
		const cachedResult = await arbitrateCheckoutLock();
		if (cachedResult) {
			preserveSubjectCache({ ctx });
			return cachedResult;
		}
	}

	const pendingInvoiceResult = await findPendingInvoiceConflict({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		attachProduct: billingContext.attachProduct,
		loadPendingCustomerProducts: () =>
			listPendingCustomerProducts({
				ctx,
				fullCustomer: billingContext.fullCustomer,
			}),
	});
	if (pendingInvoiceResult) {
		preserveSubjectCache({ ctx });
		// Long-lived skipped the lock above; a completed session must still win.
		const cachedResult = shouldCreateLongLivedCheckout
			? await arbitrateCheckoutLock()
			: null;
		return (
			cachedResult ?? {
				billingContext,
				billingPlan,
				billingResult: pendingInvoiceResult,
			}
		);
	}

	if (shouldCreateLongLivedCheckout && !billingContext.enablePlanImmediately) {
		// Creating a checkout changes no Autumn balance state. Keep any accepted
		// Redis-only tracks for the later confirmation request to consume.
		preserveSubjectCache({ ctx });
		return createAutumnCheckout<AttachBillingContext>({
			ctx,
			action: CheckoutAction.Attach,
			params,
			billingContext,
			billingPlan,
			expiresInMs: LONG_LIVED_CHECKOUT_EXPIRY_MS,
		});
	}

	if (
		billingContext.checkoutMode === "autumn_checkout" &&
		!skipAutumnCheckout
	) {
		preserveSubjectCache({ ctx });
		return createAutumnCheckout<AttachBillingContext>({
			ctx,
			action: CheckoutAction.Attach,
			params: autumnCheckoutParams,
			billingContext,
			billingPlan,
		});
	}

	// enable_plan_immediately grants the plan now, so the link wraps a real attach.
	const longLivedCheckout = shouldCreateLongLivedCheckout
		? (
				await billingPlanToAutumnCheckout({
					ctx,
					action: CheckoutAction.Attach,
					params,
					billingContext,
					billingPlan,
					expiresInMs: LONG_LIVED_CHECKOUT_EXPIRY_MS,
				})
			).checkout
		: undefined;
	if (longLivedCheckout) {
		billingContext.longLivedCheckout = {
			id: longLivedCheckout.id,
			expiresAt: longLivedCheckout.expires_at,
		};
	}

	// 6. Save request billing details first so tax resolves against the new location
	billingContext.stripeCustomer = await applyBillingDetailsForBilling({
		ctx,
		billingContext,
	});

	// 7. Execute billing plan
	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
		checkoutLockParamsHash: !skipAutumnCheckout
			? hashJson({ value: autumnCheckoutParams })
			: undefined,
	});
	if (billingResult.stripe.deferred) {
		preserveSubjectCache({ ctx });
	}

	// 8. Publish the compute-time balance transition
	await publishBillingTransition({
		ctx,
		billingContext,
		billingPlan,
		executionDeferred: billingResult.stripe.deferred === true,
	});

	logStripeBillingResult({ ctx, result: billingResult.stripe });

	if (longLivedCheckout) {
		await updateCheckoutDbAndCache({
			ctx,
			oldCheckout: longLivedCheckout,
			updates: {
				response: billingResultToResponse({ billingContext, billingResult }),
			},
		});

		return {
			billingContext,
			billingPlan,
			billingResult: {
				...billingResult,
				autumn: { checkout: longLivedCheckout },
			},
		};
	}

	return {
		billingContext,
		billingPlan,
		billingResult,
	};
}
