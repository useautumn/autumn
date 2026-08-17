import {
	type AttachBillingContext,
	type AttachParamsV1,
	type BillingContextOverride,
	CheckoutAction,
	cusProductsToCusEnts,
	type FullCusProduct,
} from "@autumn/shared";
import { ms } from "@shared/utils/common/unixUtils";
import { checkoutSessionLock } from "@/external/redis/actions/checkoutSessionLock/checkoutSessionLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveAttachExistingUsagesConfig } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct.js";
import { computeAttachPlan } from "@/internal/billing/v2/actions/attach/compute/computeAttachPlan";
import { handleAttachComputeErrors } from "@/internal/billing/v2/actions/attach/errors/handleAttachComputeErrors";
import { handleAttachV2Errors } from "@/internal/billing/v2/actions/attach/errors/handleAttachV2Errors";
import { logAttachContext } from "@/internal/billing/v2/actions/attach/logs/logAttachContext";
import { persistPublishedBalanceTransitions } from "@/internal/billing/v2/actions/attach/persistPublishedBalanceTransitions.js";
import { setupAttachBillingContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachBillingContext";
import { checkCheckoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkCheckoutSessionLock";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { resolveCarryOverUsagesParam } from "@/internal/billing/v2/utils/handleCarryOvers/resolveCarryOverUsagesParam";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages.js";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import {
	type PublishCachedFullSubjectResult,
	publishCachedFullSubject,
	type SimpleBalanceTransition,
} from "@/internal/customers/cache/fullSubject/actions/publishCachedFullSubject.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { hashJson } from "@/utils/hash/hashJson";
import {
	type CreateAutumnCheckoutResult,
	createAutumnCheckout,
} from "../../common/createAutumnCheckout";

const LONG_LIVED_CHECKOUT_EXPIRY_MS = ms.days(90);

const buildSimpleAttachBalanceTransitions = ({
	ctx,
	billingContext,
	params,
	targetCustomerProduct,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
	targetCustomerProduct: FullCusProduct;
}): SimpleBalanceTransition[] | "UNSUPPORTED" => {
	const existingUsagesConfig = resolveAttachExistingUsagesConfig({
		ctx,
		attachBillingContext: billingContext,
		params,
	});
	if (!existingUsagesConfig) return [];

	const { fromCustomerProduct, ...usageOptions } = existingUsagesConfig;
	if (fromCustomerProduct.id !== billingContext.currentCustomerProduct?.id) {
		return "UNSUPPORTED";
	}

	const existingUsages = cusProductToExistingUsages({
		cusProduct: fromCustomerProduct,
		entityId: billingContext.fullCustomer.entity?.id ?? undefined,
		...usageOptions,
	});
	const balanceTransitions: SimpleBalanceTransition[] = [];

	for (const internalFeatureId of Object.keys(existingUsages)) {
		const sourceCustomerEntitlements = cusProductsToCusEnts({
			cusProducts: [fromCustomerProduct],
			internalFeatureIds: [internalFeatureId],
		});
		const targetCustomerEntitlements = cusProductsToCusEnts({
			cusProducts: [targetCustomerProduct],
			internalFeatureIds: [internalFeatureId],
		});
		if (
			sourceCustomerEntitlements.length !== 1 ||
			targetCustomerEntitlements.length !== 1
		) {
			return "UNSUPPORTED";
		}

		const [sourceCustomerEntitlement] = sourceCustomerEntitlements;
		const [targetCustomerEntitlement] = targetCustomerEntitlements;
		if (sourceCustomerEntitlement.balance === null) return "UNSUPPORTED";
		balanceTransitions.push({
			sourceCustomerEntitlementId: sourceCustomerEntitlement.id,
			targetCustomerEntitlementId: targetCustomerEntitlement.id,
			sourceBalance: sourceCustomerEntitlement.balance,
			sourceAdjustment: sourceCustomerEntitlement.adjustment ?? 0,
		});
	}

	return balanceTransitions;
};

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

	if (shouldCreateLongLivedCheckout) {
		// Creating a checkout changes no Autumn balance state. Keep any accepted
		// Redis-only tracks for the later confirmation request to consume.
		ctx.skipSubjectCacheDeletion = true;
		return createAutumnCheckout<AttachBillingContext>({
			ctx,
			action: CheckoutAction.Attach,
			params,
			billingContext,
			billingPlan,
			expiresInMs: LONG_LIVED_CHECKOUT_EXPIRY_MS,
		});
	}

	const autumnCheckoutParams = params.long_lived_checkout
		? { ...params, long_lived_checkout: false }
		: params;

	// 5. Checkout session lock (skip for confirm flows)
	if (!skipAutumnCheckout) {
		const cachedResult = await checkCheckoutSessionLock({
			ctx,
			params: autumnCheckoutParams,
			billingContext,
			billingPlan,
			existingLock: checkoutReservation,
		});

		if (cachedResult) {
			ctx.skipSubjectCacheDeletion = true;
			return cachedResult;
		}
	}

	if (
		billingContext.checkoutMode === "autumn_checkout" &&
		!skipAutumnCheckout
	) {
		ctx.skipSubjectCacheDeletion = true;
		return createAutumnCheckout<AttachBillingContext>({
			ctx,
			action: CheckoutAction.Attach,
			params: autumnCheckoutParams,
			billingContext,
			billingPlan,
		});
	}

	// 6. Execute billing plan
	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
		checkoutLockParamsHash: !skipAutumnCheckout
			? hashJson({ value: autumnCheckoutParams })
			: undefined,
	});
	if (billingResult.stripe.deferred) {
		ctx.skipSubjectCacheDeletion = true;
	}

	const outgoingCustomerProduct = billingContext.currentCustomerProduct;
	const shouldPublishImmediateTransition =
		!billingResult.stripe.deferred &&
		!ctx.skipCache &&
		!contextOverride?.fullCustomer &&
		!skipAutumnCheckout &&
		billingContext.planTiming === "immediate";
	if (shouldPublishImmediateTransition && outgoingCustomerProduct) {
		try {
			const targetCustomerProduct = autumnBillingPlan.insertCustomerProducts[0];
			const hasUnsupportedBalanceWrites =
				params.carry_over_balances?.enabled ||
				(autumnBillingPlan.insertCustomerEntitlements?.length ?? 0) > 0 ||
				Boolean(autumnBillingPlan.pooledBalancePlan) ||
				Boolean(autumnBillingPlan.oneOffPurchaseRebalance);
			const balanceTransitions =
				targetCustomerProduct && !hasUnsupportedBalanceWrites
					? buildSimpleAttachBalanceTransitions({
							ctx,
							billingContext,
							params,
							targetCustomerProduct,
						})
					: "UNSUPPORTED";
			const finalSubject = await getFullSubjectNormalized({
				ctx,
				customerId:
					billingContext.fullCustomer.id ??
					billingContext.fullCustomer.internal_id,
				entityId: params.entity_id,
				runLazyResets: false,
				readFrom: "primary",
				routeSource: "attach:publish-cache",
			});
			const publishResult: PublishCachedFullSubjectResult =
				finalSubject && balanceTransitions !== "UNSUPPORTED"
					? await publishCachedFullSubject({
							ctx,
							normalized: finalSubject.normalized,
							outgoingCustomerEntitlements:
								outgoingCustomerProduct.customer_entitlements,
							balanceTransitions,
						})
					: { status: finalSubject ? "UNSUPPORTED" : "FAILED" };

			if (publishResult.status === "OK") {
				ctx.skipSubjectCacheDeletion = true;
				await persistPublishedBalanceTransitions({
					ctx,
					balanceTransitions: publishResult.balanceTransitions,
				});
			}
		} catch (error) {
			ctx.logger.warn(
				{ error },
				"[attach] Failed to complete the atomic balance transition",
			);
		}
	}

	logStripeBillingResult({ ctx, result: billingResult.stripe });

	return {
		billingContext,
		billingPlan,
		billingResult,
	};
}
