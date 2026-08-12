import {
	type CheckoutMode,
	type CreateScheduleBillingContext,
	type CreateScheduleParamsV0,
	isOneOffProduct,
	isPastStartDate,
	isProductPaidAndRecurring,
	type MultiAttachBillingContext,
	type MultiAttachParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupAttachEndOfCycleMs } from "@/internal/billing/v2/actions/attach/setup/setupAttachEndOfCycleMs";
import { setupAnchorResetRefund } from "@/internal/billing/v2/setup/setupAnchorResetRefund";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { setupReplacedScheduleCustomerProductIds } from "@/internal/customers/schedules/setup/setupReplacedScheduleCustomerProductIds";
import { isStripeConnected } from "@/internal/orgs/orgUtils";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import { FIRST_PHASE_TOLERANCE_MS } from "../errors/handleFirstPhaseStartDateErrors";
import {
	getInitialCreateSchedulePhase,
	normalizeCreateSchedulePhases,
	phaseHasNumericStart,
} from "../errors/normalizeCreateSchedulePhases";
import { validateCreateSchedulePhasePlans } from "../errors/validateCreateSchedulePhasePlans";
import { validateUnscheduledPlanScopes } from "../errors/validateUnscheduledPlanScopes";
import { isExistingScheduleUpdate } from "../utils/isExistingScheduleUpdate";
import { resolveCreateScheduleRecurringProducts } from "../utils/resolveCreateScheduleRecurringProducts";
import {
	markUnscheduledProductContexts,
	resolveUnscheduledProductContexts,
} from "../utils/unscheduledProductContexts";
import { setupScheduledProductsContext } from "./setupScheduledProductsContext";

type CreateScheduleCheckoutModeContext = Pick<
	CreateScheduleBillingContext,
	| "fullProducts"
	| "paymentMethod"
	| "stripeSubscription"
	| "trialContext"
	| "invoiceMode"
>;

const resolveNoBillingChanges = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}) =>
	params.no_billing_changes === true ||
	(!isStripeConnected({ org: ctx.org, env: ctx.env }) &&
		params.billing_behavior === "none" &&
		params.redirect_mode === "never");

const setupCreateScheduleCheckoutMode = ({
	billingContext,
	redirectMode,
}: {
	billingContext: CreateScheduleCheckoutModeContext;
	redirectMode: CreateScheduleParamsV0["redirect_mode"];
}): CheckoutMode => {
	if (redirectMode === "never") {
		return null;
	}
	if (billingContext.invoiceMode) {
		return null;
	}

	const hasPaymentMethod = !!billingContext.paymentMethod;
	const hasExistingSubscription = !!billingContext.stripeSubscription;
	const hasOneOffProduct = billingContext.fullProducts.some((product) =>
		isOneOffProduct({ product }),
	);
	const hasPaidRecurringProduct = billingContext.fullProducts.some(
		isProductPaidAndRecurring,
	);
	const shouldUseStripeCheckout =
		hasOneOffProduct || (!hasExistingSubscription && hasPaidRecurringProduct);

	if (!hasPaymentMethod && shouldUseStripeCheckout) {
		const noCardRequiredTrial =
			billingContext.trialContext?.trialEndsAt &&
			billingContext.trialContext.cardRequired === false;

		return noCardRequiredTrial ? null : "stripe_checkout";
	}

	if (redirectMode === "always") {
		return shouldUseStripeCheckout ? "stripe_checkout" : "autumn_checkout";
	}

	return null;
};

const phaseToImmediateParams = ({
	ctx,
	params,
	phase,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	phase: CreateScheduleParamsV0["phases"][number];
}): MultiAttachParamsV0 &
	Pick<CreateScheduleParamsV0, "no_billing_changes"> => ({
	customer_id: params.customer_id,
	entity_id: params.entity_id,
	no_billing_changes: resolveNoBillingChanges({ ctx, params }),
	// Unscheduled plans bill with the immediate phase, so they attach alongside
	// it — always last, which is how the contexts are told apart afterwards.
	plans: [...phase.plans, ...(params.unscheduled_plans ?? [])].map((plan) => ({
		plan_id: plan.plan_id,
		entity_id: plan.entity_id,
		customize: plan.customize,
		feature_quantities: plan.feature_quantities,
		version: plan.version,
		subscription_id: plan.subscription_id,
	})),
	invoice_mode: params.invoice_mode,
	free_trial: params.free_trial,
	currency: params.currency,
	discounts: params.discounts,
	success_url: params.success_url,
	checkout_session_params: params.checkout_session_params,
	redirect_mode: params.redirect_mode ?? "if_required",
	enable_plan_immediately: params.enable_plan_immediately,
});

const getCurrentPhaseIndex = ({
	phases,
	currentEpochMs,
}: {
	phases: ReturnType<typeof normalizeCreateSchedulePhases>;
	currentEpochMs: number;
}) => {
	let currentPhaseIndex = 0;

	for (let index = 0; index < phases.length; index++) {
		const phase = phases[index];
		if (!phase || phase.starts_at > currentEpochMs + FIRST_PHASE_TOLERANCE_MS) {
			break;
		}
		currentPhaseIndex = index;
	}

	return currentPhaseIndex;
};

const setupCreateScheduleImmediatePhase = async ({
	ctx,
	params,
	preview,
	billingContext,
	normalizedPhases,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	preview: boolean;
	billingContext: MultiAttachBillingContext;
	normalizedPhases: ReturnType<typeof normalizeCreateSchedulePhases>;
}) => {
	const immediatePhaseIndex = isExistingScheduleUpdate({ billingContext })
		? getCurrentPhaseIndex({
				phases: normalizedPhases,
				currentEpochMs: billingContext.currentEpochMs,
			})
		: 0;
	const immediatePhase = normalizedPhases[immediatePhaseIndex]!;

	// The opening phase already built the context passed in; a later phase has to
	// rebuild it against its own plans.
	const immediateBillingContext =
		immediatePhaseIndex === 0
			? billingContext
			: await setupImmediateMultiProductBillingContext({
					ctx,
					params: phaseToImmediateParams({
						ctx,
						params,
						phase: immediatePhase,
					}),
					preview,
					billingStartsAt: immediatePhase.starts_at,
					billingStartsAtToleranceMs: FIRST_PHASE_TOLERANCE_MS,
					includeScheduledProductsForScheduleLookup: true,
				});

	return {
		billingContext: markUnscheduledProductContexts({
			billingContext: immediateBillingContext,
			unscheduledPlanCount: params.unscheduled_plans?.length ?? 0,
		}),
		immediatePhase,
		futurePhases: normalizedPhases.slice(immediatePhaseIndex + 1),
	};
};

/** Build billing context for the immediate phase. */
export const setupCreateScheduleBillingContext = async ({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	preview?: boolean;
}): Promise<CreateScheduleBillingContext> => {
	const initialPhase = getInitialCreateSchedulePhase({
		phases: params.phases,
	});

	let billingContext = await setupImmediateMultiProductBillingContext({
		ctx,
		params: phaseToImmediateParams({ ctx, params, phase: initialPhase }),
		preview,
		billingStartsAt: phaseHasNumericStart(initialPhase)
			? initialPhase.starts_at
			: undefined,
		billingStartsAtToleranceMs: FIRST_PHASE_TOLERANCE_MS,
		includeScheduledProductsForScheduleLookup: true,
	});

	const cycleBoundaryMs =
		params.billing_cycle_anchor === undefined
			? setupAttachEndOfCycleMs({
					planTiming: "end_of_cycle",
					stripeSubscription: billingContext.stripeSubscription,
					billingCycleAnchorMs: billingContext.billingCycleAnchorMs,
					currentEpochMs: billingContext.currentEpochMs,
				})
			: undefined;

	const normalizedPhases = normalizeCreateSchedulePhases({
		phases: params.phases,
		currentEpochMs: billingContext.currentEpochMs,
		cycleBoundaryMs,
	});
	const immediatePhaseContext = await setupCreateScheduleImmediatePhase({
		ctx,
		params,
		preview,
		billingContext,
		normalizedPhases,
	});
	billingContext = immediatePhaseContext.billingContext;
	const { immediatePhase, futurePhases } = immediatePhaseContext;

	validateCreateSchedulePhasePlans({
		plans: billingContext.productContexts.map((productContext) => ({
			fullProduct: productContext.fullProduct,
			scopeId: productContext.fullCustomer.entity?.internal_id,
		})),
	});

	const scheduledPhaseContexts = await setupScheduledProductsContext({
		ctx,
		phases: futurePhases,
		fullCustomer: billingContext.fullCustomer,
		currentEpochMs: billingContext.currentEpochMs,
		immediatePhaseProductContexts: billingContext.productContexts,
	});

	validateUnscheduledPlanScopes({
		unscheduledProductContexts: resolveUnscheduledProductContexts({
			productContexts: billingContext.productContexts,
		}),
		scheduledPhaseContexts,
	});

	const scheduledCustomPrices = scheduledPhaseContexts.flatMap((phase) =>
		phase.productContexts.flatMap(
			(productContext) => productContext.customPrices,
		),
	);
	const scheduledCustomEntitlements = scheduledPhaseContexts.flatMap((phase) =>
		phase.productContexts.flatMap(
			(productContext) => productContext.customEntitlements,
		),
	);

	const replacedScheduleCustomerProductIds =
		await setupReplacedScheduleCustomerProductIds({
			ctx,
			internalCustomerId: billingContext.fullCustomer.internal_id,
		});

	const scheduleBillingContext: CreateScheduleBillingContext = {
		...billingContext,
		replacedScheduleCustomerProductIds,
		checkoutMode: setupCreateScheduleCheckoutMode({
			billingContext,
			redirectMode: params.redirect_mode,
		}),
		customPrices: [
			...(billingContext.customPrices ?? []),
			...scheduledCustomPrices,
		],
		customEnts: [
			...(billingContext.customEnts ?? []),
			...scheduledCustomEntitlements,
		],
		isCustom:
			billingContext.isCustom ||
			scheduledCustomPrices.length > 0 ||
			scheduledCustomEntitlements.length > 0,
		requestedProrationBehavior: params.billing_behavior,
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
		billingStartsAt: immediatePhase.starts_at,
		subscriptionBackdateStartMs: isPastStartDate(
			immediatePhase.starts_at,
			billingContext.currentEpochMs,
			FIRST_PHASE_TOLERANCE_MS,
		)
			? immediatePhase.starts_at
			: undefined,
		immediatePhase,
		futurePhases,
		scheduledPhaseContexts,
	};

	const { recurringActive } = resolveCreateScheduleRecurringProducts({
		billingContext: scheduleBillingContext,
	});

	// Immediate setup omits the requested anchor, so recompute it before proration.
	if (params.billing_cycle_anchor !== undefined) {
		const firstProduct = billingContext.fullProducts[0];
		if (firstProduct) {
			let recomputedAnchor = setupBillingCycleAnchor({
				stripeSubscription: billingContext.stripeSubscription,
				customerProduct: recurringActive[0],
				newFullProduct: firstProduct,
				trialContext: billingContext.trialContext,
				currentEpochMs: billingContext.currentEpochMs,
				requestedBillingCycleAnchor: params.billing_cycle_anchor,
			});
			if (billingContext.trialContext?.trialEndsAt) {
				recomputedAnchor = billingContext.trialContext.trialEndsAt;
			}
			scheduleBillingContext.billingCycleAnchorMs = recomputedAnchor;
			scheduleBillingContext.resetCycleAnchorMs = setupResetCycleAnchor({
				billingCycleAnchorMs: recomputedAnchor,
				customerProduct: undefined,
				newFullProduct: firstProduct,
			});
		}
	}

	// Preserve renewal charges when resetting the cycle without proration.
	scheduleBillingContext.anchorResetRefund = setupAnchorResetRefund({
		billingCycleAnchor: params.billing_cycle_anchor,
		prorationBehavior: params.billing_behavior,
		outgoingCustomerProduct: recurringActive[0],
	});

	return scheduleBillingContext;
};
