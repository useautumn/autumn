import {
	type AutumnBillingPlan,
	CusProductStatus,
	cp,
	type FullCusProduct,
	findMainActiveCustomerProductByGroup,
	isCustomerProductCanceling,
	isFutureStartDate,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyUncancelToPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/cancel/applyUncancelToPlan";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import {
	customerProductToPooledBalanceOwnerRemovalOps,
	customerProductToPooledBalanceOwnerRestoreOps,
	customerProductToPooledBalanceRemovalOp,
	customerProductToPooledBalanceRestoreOp,
} from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import { applyCancelPlan } from "./applyCancelPlan";
import { computeCancelLineItems } from "./computeCancelLineItems";
import { computeCancelUpdates } from "./computeCancelUpdates";
import { computeCustomerProductToDelete } from "./computeCustomerProductToDelete";
import { computeDefaultCustomerProduct } from "./computeDefaultCustomerProduct";
import { computeEndOfCycleMs } from "./computeEndOfCycleMs";

const computeScheduledAddOnsToDelete = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}): FullCusProduct[] => {
	// Immediate main-plan cancellation invalidates future add-on phases in the same scope.
	const { cancelAction, customerProduct, fullCustomer } = billingContext;
	if (cancelAction !== "cancel_immediately") return [];
	if (!cp(customerProduct).main().recurring().valid) return [];

	const internalEntityId =
		customerProduct.internal_entity_id ??
		fullCustomer.entity?.internal_id ??
		undefined;

	return fullCustomer.customer_products.filter((candidateProduct) => {
		if (candidateProduct.id === customerProduct.id) return false;

		return cp(candidateProduct)
			.addOn()
			.scheduled()
			.recurring()
			.onEntity({ internalEntityId }).valid;
	});
};

const shouldDeleteCustomerProductBeforeBillingStarts = ({
	customerProduct,
	currentEpochMs,
}: {
	customerProduct: FullCusProduct;
	currentEpochMs: number;
}): boolean => {
	if (customerProduct.status === CusProductStatus.Scheduled) return true;

	const hasStripeSchedule = (customerProduct.scheduled_ids?.length ?? 0) > 0;
	const hasStripeSubscription =
		(customerProduct.subscription_ids?.length ?? 0) > 0;

	return (
		hasStripeSchedule &&
		!hasStripeSubscription &&
		isFutureStartDate(customerProduct.starts_at, currentEpochMs)
	);
};

const computeScheduledCancelPlan = ({
	billingContext,
	plan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	plan: AutumnBillingPlan;
}): AutumnBillingPlan => {
	const { customerProduct, fullCustomer } = billingContext;

	const activeCustomerProduct = findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: customerProduct.product.group,
		internalEntityId: customerProduct.internal_entity_id ?? undefined,
	});

	const scheduledCancelPlan: AutumnBillingPlan = {
		...plan,
		updateCustomerProduct: undefined,
		deleteCustomerProduct: customerProduct,
	};

	if (
		!activeCustomerProduct ||
		activeCustomerProduct.id === customerProduct.id ||
		!isCustomerProductCanceling(activeCustomerProduct)
	) {
		return scheduledCancelPlan;
	}

	return {
		...scheduledCancelPlan,
		updateCustomerProduct: {
			customerProduct: activeCustomerProduct,
			updates: {
				canceled: false,
				canceled_at: null,
				ended_at: null,
			},
		},
	};
};

/**
 * When cancelling a revert trial, unpause the previous plan by adding
 * an update to restore its status to Active.
 */
const applyRevertTrialUnpause = ({
	billingContext,
	plan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	plan: AutumnBillingPlan;
}): AutumnBillingPlan => {
	const { customerProduct, fullCustomer } = billingContext;
	const isRevertTrial = customerProduct.on_trial_end === "revert";
	const hasPreviousProduct = !!customerProduct.previous_customer_product_id;

	if (!isRevertTrial || !hasPreviousProduct) return plan;

	const previousCusProduct = fullCustomer.customer_products.find(
		(cp) => cp.id === customerProduct.previous_customer_product_id,
	);

	const canRestore = previousCusProduct?.status === CusProductStatus.Paused;

	if (!canRestore) return plan;
	const pooledRestore = computeAttachPooledBalanceOps({
		customerProduct: {
			...previousCusProduct,
			status: CusProductStatus.Active,
		},
		attachBillingContext: {
			billingStartsAt: billingContext.currentEpochMs,
			currentCustomerProduct: previousCusProduct,
			currentEpochMs: billingContext.currentEpochMs,
			fullCustomer,
			planTiming: "immediate",
			requestedBillingCycleAnchor: billingContext.requestedBillingCycleAnchor,
			skipBillingChanges: billingContext.skipBillingChanges,
		},
		removeCurrentSource: false,
	});

	return {
		...plan,
		updateCustomerProducts: [
			...(plan.updateCustomerProducts ?? []),
			{
				customerProduct: previousCusProduct,
				updates: { status: CusProductStatus.Active },
			},
		],
		pooledBalanceOps: [
			...(plan.pooledBalanceOps ?? []),
			...pooledRestore.pooledBalanceOps,
		],
	};
};

/**
 * Computes and applies the cancel plan for a subscription.
 *
 * Handles two cancel actions:
 * - 'cancel_end_of_cycle': Schedule cancellation at cycle end, insert scheduled default product
 * - 'cancel_immediately': Cancel now, insert active default product
 */
export const computeCancelPlan = ({
	ctx,
	billingContext,
	plan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	plan: AutumnBillingPlan;
}): AutumnBillingPlan => {
	if (!billingContext.cancelAction) return plan;

	if (billingContext.cancelAction === "uncancel") {
		const uncancelledPlan = applyUncancelToPlan({
			billingContext,
			plan,
		});
		const expectedEffectiveAt = billingContext.customerProduct.ended_at;
		if (typeof expectedEffectiveAt !== "number") return uncancelledPlan;
		const pooledSourceRestore = customerProductToPooledBalanceRestoreOp({
			customerProduct: billingContext.customerProduct,
			expectedEffectiveAt,
		});

		return {
			...uncancelledPlan,
			pooledBalanceOps: [
				...(uncancelledPlan.pooledBalanceOps ?? []),
				...(pooledSourceRestore ? [pooledSourceRestore] : []),
				...customerProductToPooledBalanceOwnerRestoreOps({
					customerProduct: billingContext.customerProduct,
					expectedEffectiveAt,
				}),
			],
		};
	}

	if (
		shouldDeleteCustomerProductBeforeBillingStarts({
			customerProduct: billingContext.customerProduct,
			currentEpochMs: billingContext.currentEpochMs,
		})
	) {
		return computeScheduledCancelPlan({
			billingContext,
			plan,
		});
	}

	// Step 1: Calculate when the subscription ends
	const endOfCycleMs = computeEndOfCycleMs({ billingContext });

	ctx.logger.debug(
		`[computeCancelPlan] ${billingContext.cancelAction}: end of cycle at ${endOfCycleMs}`,
	);

	// Step 2: Build cancel updates for customer product
	const cancelUpdates = computeCancelUpdates({ billingContext, endOfCycleMs });

	// Step 3: Create default product (if applicable)
	// Skip when cancelling a revert trial — the previous plan will be restored instead.
	const isRevertTrialCancel =
		billingContext.customerProduct.on_trial_end === "revert";
	const rawDefaultCustomerProduct = isRevertTrialCancel
		? undefined
		: computeDefaultCustomerProduct({
				ctx,
				billingContext,
				endOfCycleMs,
			});
	const preparedDefault =
		rawDefaultCustomerProduct &&
		billingContext.cancelAction === "cancel_immediately"
			? computeAttachPooledBalanceOps({
					customerProduct: rawDefaultCustomerProduct,
					attachBillingContext: {
						billingStartsAt: billingContext.currentEpochMs,
						currentCustomerProduct: billingContext.customerProduct,
						currentEpochMs: billingContext.currentEpochMs,
						fullCustomer: billingContext.fullCustomer,
						planTiming: "immediate",
						requestedBillingCycleAnchor:
							billingContext.requestedBillingCycleAnchor,
						skipBillingChanges: billingContext.skipBillingChanges,
					},
					removeCurrentSource: false,
				})
			: undefined;
	const defaultCustomerProduct =
		preparedDefault?.customerProduct ?? rawDefaultCustomerProduct;

	ctx.logger.debug(
		`[computeCancelPlan] default customer product: ${defaultCustomerProduct?.product.name}`,
	);

	// Step 4: Find existing scheduled product to delete
	const productToDelete = computeCustomerProductToDelete({ billingContext });
	const productsToDelete = computeScheduledAddOnsToDelete({ billingContext });

	// Step 5: Compute prorated refund line items for immediate cancellation
	const cancelLineItems = computeCancelLineItems({ ctx, billingContext });

	// Apply all computed values to the plan
	const cancelledPlan = applyCancelPlan({
		plan,
		cancelUpdates,
		defaultCustomerProduct,
		productToDelete,
		productsToDelete,
		cancelLineItems,
		existingCustomerProduct: billingContext.customerProduct,
	});

	// If this is a revert trial being cancelled, unpause the previous plan
	const finalPlan = applyRevertTrialUnpause({
		billingContext,
		plan: cancelledPlan,
	});
	const pooledSourceRemoval = customerProductToPooledBalanceRemovalOp({
		customerProduct: billingContext.customerProduct,
		effectiveAt:
			billingContext.cancelAction === "cancel_end_of_cycle"
				? endOfCycleMs
				: null,
	});
	if (billingContext.cancelAction !== "cancel_end_of_cycle") {
		return {
			...finalPlan,
			pooledBalanceOps: [
				...(finalPlan.pooledBalanceOps ?? []),
				...(preparedDefault?.pooledBalanceOps ?? []),
				...(pooledSourceRemoval ? [pooledSourceRemoval] : []),
			],
		};
	}

	return {
		...finalPlan,
		pooledBalanceOps: [
			...(finalPlan.pooledBalanceOps ?? []),
			...(preparedDefault?.pooledBalanceOps ?? []),
			...(pooledSourceRemoval ? [pooledSourceRemoval] : []),
			...customerProductToPooledBalanceOwnerRemovalOps({
				customerProduct: billingContext.customerProduct,
				effectiveAt: endOfCycleMs,
			}),
		],
	};
};
