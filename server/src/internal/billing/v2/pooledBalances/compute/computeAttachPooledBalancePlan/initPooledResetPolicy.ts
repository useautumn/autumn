import {
	type AttachBillingContext,
	cp,
	type FullCusProduct,
	isCustomerProductFree,
} from "@autumn/shared";
import type { PooledResetPolicy } from "@/internal/billing/v2/pooledBalances/utils/pooledResetPolicy.js";
import { customerProductToPooledCustomerEntitlements } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { throwUnsupportedPooledAttach } from "./throwUnsupportedPooledAttach.js";

type ResetPolicyBillingContext = Pick<
	AttachBillingContext,
	| "billingStartsAt"
	| "currentCustomerProduct"
	| "currentEpochMs"
	| "fullCustomer"
	| "requestedBillingCycleAnchor"
	| "skipBillingChanges"
>;

// The only place a free-pool anchor is ever computed.
const initFreePoolResetPolicy = ({
	attachBillingContext,
}: {
	attachBillingContext: ResetPolicyBillingContext;
}): PooledResetPolicy => {
	const {
		requestedBillingCycleAnchor,
		billingStartsAt,
		currentEpochMs,
		fullCustomer,
		currentCustomerProduct,
	} = attachBillingContext;

	const requestedResetCycleAnchor =
		requestedBillingCycleAnchor === "now"
			? currentEpochMs
			: requestedBillingCycleAnchor;

	const existingResetCycleAnchor = customerProductToPooledCustomerEntitlements({
		customerProduct: currentCustomerProduct,
	})[0]?.reset_cycle_anchor;

	return {
		lazy: {
			anchor:
				requestedResetCycleAnchor ??
				billingStartsAt ??
				existingResetCycleAnchor ??
				fullCustomer.created_at,
			now: currentEpochMs,
		},
	};
};

export const initPooledResetPolicy = ({
	customerProduct,
	attachBillingContext,
	shouldContribute,
}: {
	customerProduct: FullCusProduct;
	attachBillingContext: ResetPolicyBillingContext;
	shouldContribute: boolean;
}): PooledResetPolicy => {
	if (isCustomerProductFree(customerProduct)) {
		return initFreePoolResetPolicy({ attachBillingContext });
	}

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

	return {
		// A newly created Stripe subscription is linked into this policy by
		// addStripeSubscriptionIdToBillingPlan before Autumn persistence runs.
		stripeSubscriptionId: existingSubscriptionId ?? customerProduct.id,
	};
};
