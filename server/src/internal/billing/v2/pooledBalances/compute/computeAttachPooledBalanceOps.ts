import {
	type AttachBillingContext,
	cp,
	customerProductHasActiveStatus,
	ErrCode,
	type FullCusProduct,
	isCustomerProductFree,
	type PooledBalanceOp,
	PooledBalanceResetOwnerType,
	RecaseError,
} from "@autumn/shared";
import {
	customerProductHasPooledSource,
	isPooledSourceCustomerEntitlement,
} from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { extractPooledBalanceOps } from "./extractPooledBalanceOps.js";

type PooledAttachBillingContext = Pick<
	AttachBillingContext,
	| "billingStartsAt"
	| "currentCustomerProduct"
	| "currentEpochMs"
	| "fullCustomer"
	| "planTiming"
	| "requestedBillingCycleAnchor"
	| "skipBillingChanges"
>;
const throwUnsupportedPooledAttach = ({
	message,
}: {
	message: string;
}): never => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const getFreePoolResetCycleAnchor = ({
	attachBillingContext,
}: {
	attachBillingContext: PooledAttachBillingContext;
}) => {
	const {
		requestedBillingCycleAnchor,
		billingStartsAt,
		currentEpochMs,
		fullCustomer,
		currentCustomerProduct,
	} = attachBillingContext;
	if (typeof requestedBillingCycleAnchor === "number") {
		return requestedBillingCycleAnchor;
	}
	if (requestedBillingCycleAnchor === "now") return currentEpochMs;
	if (billingStartsAt !== undefined) return billingStartsAt;
	const existingPooledResetCycleAnchor =
		currentCustomerProduct?.customer_entitlements.find(
			(customerEntitlement) =>
				isPooledSourceCustomerEntitlement({
					customerEntitlement,
					customerProduct: currentCustomerProduct,
				}) && typeof customerEntitlement.reset_cycle_anchor === "number",
		)?.reset_cycle_anchor;
	if (typeof existingPooledResetCycleAnchor === "number") {
		return existingPooledResetCycleAnchor;
	}
	return fullCustomer.created_at;
};

export const computeAttachPooledBalanceOps = ({
	customerProduct,
	attachBillingContext,
	removeCurrentSource = true,
}: {
	customerProduct: FullCusProduct;
	attachBillingContext: PooledAttachBillingContext;
	removeCurrentSource?: boolean;
}): {
	customerProduct: FullCusProduct;
	pooledBalanceOps: PooledBalanceOp[];
} => {
	const { currentCustomerProduct, planTiming, currentEpochMs, fullCustomer } =
		attachBillingContext;
	const pooledBalanceOps: PooledBalanceOp[] = [];

	if (
		removeCurrentSource &&
		planTiming === "immediate" &&
		currentCustomerProduct &&
		customerProductHasPooledSource({
			customerProduct: currentCustomerProduct,
		})
	) {
		pooledBalanceOps.push({
			op: "remove_source",
			internalCustomerId: currentCustomerProduct.internal_customer_id,
			sourceCustomerProductId: currentCustomerProduct.id,
			effectiveAt: null,
		});
	}

	if (!customerProductHasPooledSource({ customerProduct })) {
		return { customerProduct, pooledBalanceOps };
	}

	const effectiveStartsAt =
		customerProduct.access_starts_at ?? customerProduct.starts_at;
	const shouldContribute =
		customerProductHasActiveStatus(customerProduct) &&
		effectiveStartsAt <= currentEpochMs;
	if (
		customerProductHasActiveStatus(customerProduct) &&
		effectiveStartsAt > currentEpochMs
	) {
		return throwUnsupportedPooledAttach({
			message:
				"Pooled entity plan items cannot be scheduled or start in the future yet.",
		});
	}

	if (customerProduct.free_trial_id || customerProduct.trial_ends_at) {
		return throwUnsupportedPooledAttach({
			message: "Pooled entity plan items do not support free trials yet.",
		});
	}

	const isFree = isCustomerProductFree(customerProduct);
	let extracted: ReturnType<typeof extractPooledBalanceOps>;
	if (isFree) {
		const resetCycleAnchor = getFreePoolResetCycleAnchor({
			attachBillingContext,
		});
		extracted = extractPooledBalanceOps({
			customerProduct,
			resetOwnerType: PooledBalanceResetOwnerType.Free,
			resetOwnerId: fullCustomer.internal_id,
			poolResetCycleAnchor: resetCycleAnchor,
			poolCycleNow: currentEpochMs,
			usageReapplySourceCustomerProduct: currentCustomerProduct,
		});
	} else {
		const { valid: isPaidRecurring } = cp(customerProduct).paid().recurring();
		if (!isPaidRecurring) {
			return throwUnsupportedPooledAttach({
				message:
					"Paid pooled entity plan items require a recurring subscription.",
			});
		}

		const existingSubscriptionId = customerProduct.subscription_ids?.[0];
		if (
			shouldContribute &&
			attachBillingContext.skipBillingChanges &&
			!existingSubscriptionId
		) {
			return throwUnsupportedPooledAttach({
				message:
					"Paid pooled entity plan items require a billing subscription reset owner.",
			});
		}

		extracted = extractPooledBalanceOps({
			customerProduct,
			resetOwnerType: PooledBalanceResetOwnerType.Subscription,
			// A newly created Stripe subscription is linked into this operation by
			// addStripeSubscriptionIdToBillingPlan before Autumn persistence runs.
			resetOwnerId: existingSubscriptionId ?? customerProduct.id,
			usageReapplySourceCustomerProduct: currentCustomerProduct,
		});
	}

	return {
		customerProduct: extracted.customerProduct,
		pooledBalanceOps: [
			...pooledBalanceOps,
			...(shouldContribute ? extracted.pooledBalanceOps : []),
		],
	};
};
