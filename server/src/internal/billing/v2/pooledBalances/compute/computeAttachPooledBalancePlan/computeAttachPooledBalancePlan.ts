import {
	type AttachBillingContext,
	customerProductHasActiveStatus,
	type FullCusProduct,
	type PooledBalancePlan,
	type RemovePooledBalanceSource,
	type UpsertPooledBalanceSourceSpec,
} from "@autumn/shared";
import { initUpsertPooledBalanceSourceSpecs } from "@/internal/billing/v2/pooledBalances/compute/initUpsertPooledBalanceSourceSpec/initUpsertPooledBalanceSourceSpecs.js";
import { customerProductHasPooledSource } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { initPooledResetPolicy } from "./initPooledResetPolicy.js";
import { throwUnsupportedPooledAttach } from "./throwUnsupportedPooledAttach.js";

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

const computeRemoveSource = ({
	removeCurrentSource,
	planTiming,
	currentCustomerProduct,
}: {
	removeCurrentSource: boolean;
	planTiming: AttachBillingContext["planTiming"];
	currentCustomerProduct?: FullCusProduct;
}): RemovePooledBalanceSource | undefined => {
	if (
		planTiming !== "immediate" ||
		!removeCurrentSource ||
		!customerProductHasPooledSource(currentCustomerProduct)
	) {
		return undefined;
	}

	return {
		internalCustomerId: currentCustomerProduct.internal_customer_id,
		sourceCustomerProductId: currentCustomerProduct.id,
		effectiveAt: null,
	};
};

const newCustomerProductShouldContribute = ({
	customerProduct,
	currentEpochMs,
}: {
	customerProduct: FullCusProduct;
	currentEpochMs: number;
}) => {
	const isActive = customerProductHasActiveStatus(customerProduct);
	const effectiveStartsAt =
		customerProduct.access_starts_at ?? customerProduct.starts_at;

	if (isActive && effectiveStartsAt > currentEpochMs) {
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

	return isActive;
};

const computeUpsertSources = ({
	customerProduct,
	attachBillingContext,
}: {
	customerProduct: FullCusProduct;
	attachBillingContext: PooledAttachBillingContext;
}): {
	customerProduct: FullCusProduct;
	upsertSources: UpsertPooledBalanceSourceSpec[];
} => {
	if (!customerProductHasPooledSource(customerProduct)) {
		return { customerProduct, upsertSources: [] };
	}

	const { currentCustomerProduct, currentEpochMs } = attachBillingContext;

	const shouldContribute = newCustomerProductShouldContribute({
		customerProduct,
		currentEpochMs,
	});

	const resetPolicy = initPooledResetPolicy({
		customerProduct,
		attachBillingContext,
		shouldContribute,
	});

	const { customerProduct: preparedCustomerProduct, upsertSourceSpecs } =
		initUpsertPooledBalanceSourceSpecs({
			customerProduct,
			resetPolicy,
			outgoingCustomerProduct: currentCustomerProduct,
		});

	return {
		customerProduct: preparedCustomerProduct,
		upsertSources: shouldContribute ? upsertSourceSpecs : [],
	};
};

export const computeAttachPooledBalancePlan = ({
	customerProduct,
	attachBillingContext,
	removeCurrentSource = true,
}: {
	customerProduct: FullCusProduct;
	attachBillingContext: PooledAttachBillingContext;
	removeCurrentSource?: boolean;
}): {
	customerProduct: FullCusProduct;
	pooledBalancePlan: PooledBalancePlan;
} => {
	const { currentCustomerProduct } = attachBillingContext;

	const removeSource = computeRemoveSource({
		removeCurrentSource,
		planTiming: attachBillingContext.planTiming,
		currentCustomerProduct,
	});

	const { customerProduct: updatedCustomerProduct, upsertSources } =
		computeUpsertSources({
			customerProduct,
			attachBillingContext,
		});

	return {
		customerProduct: updatedCustomerProduct,
		pooledBalancePlan: {
			...(removeSource ? { removeSources: [removeSource] } : {}),
			...(upsertSources.length > 0 ? { upsertSources } : {}),
		},
	};
};
