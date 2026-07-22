import {
	cusProductToProduct,
	type Entity,
	FeatureType,
	type FullCusProduct,
	type FullCustomer,
	type PooledBalanceOp,
} from "@autumn/shared";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { customerProductToPooledBalanceRemovalOp } from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import {
	customerProductHasPooledSource,
	isPooledSourceCustomerEntitlement,
} from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { duplicateCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/duplicateCustomerProduct/index.js";
import { initCustomerEntitlementBalance } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementBalance.js";

type RestoreOrdinaryCustomerEntitlement = {
	customerEntitlementId: string;
	balance: number;
	adjustment: number;
	additionalBalance: number;
};

type SourceOrdinaryBalanceDecrement = {
	customerEntitlementId: string;
	amount: number;
};

const withTransferEntity = ({
	customerProduct,
	toEntity,
}: {
	customerProduct: FullCusProduct;
	toEntity: Entity | null;
}): FullCusProduct => ({
	...customerProduct,
	entity_id: toEntity?.id ?? null,
	internal_entity_id: toEntity?.internal_id ?? null,
});

const pooledResetCycleAnchor = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): number | undefined =>
	customerProduct.customer_entitlements.find(
		(customerEntitlement) =>
			customerEntitlement.entitlement.pooled === true &&
			typeof customerEntitlement.reset_cycle_anchor === "number",
	)?.reset_cycle_anchor ?? undefined;

const prepareManagedSource = ({
	fullCustomer,
	customerProduct,
	currentCustomerProduct,
	now,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	currentCustomerProduct?: FullCusProduct;
	now: number;
}) =>
	computeAttachPooledBalanceOps({
		customerProduct,
		attachBillingContext: {
			currentCustomerProduct,
			currentEpochMs: now,
			fullCustomer,
			planTiming: "immediate",
			requestedBillingCycleAnchor: pooledResetCycleAnchor({
				customerProduct,
			}),
			skipBillingChanges: false,
		},
		removeCurrentSource: false,
	});

const restoreOrdinaryPooledEntitlements = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}): RestoreOrdinaryCustomerEntitlement[] =>
	customerProduct.customer_entitlements.flatMap((customerEntitlement) => {
		if (customerEntitlement.entitlement.pooled !== true) return [];

		const fullProduct = cusProductToProduct({ cusProduct: customerProduct });
		const { balance } = initCustomerEntitlementBalance({
			initContext: {
				fullCustomer,
				fullProduct,
				featureQuantities: customerProduct.options,
			},
			entitlement: customerEntitlement.entitlement,
		});

		return [
			{
				customerEntitlementId: customerEntitlement.id,
				balance,
				adjustment: 0,
				additionalBalance: 0,
			},
		];
	});

const initializeSplitCustomerProduct = ({
	fullCustomer,
	customerProduct,
	toEntity,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	toEntity: Entity | null;
}): FullCusProduct => {
	const duplicatedCustomerProduct = withTransferEntity({
		customerProduct: {
			...duplicateCustomerProduct({
				customerProduct,
				newInternalProductId: customerProduct.internal_product_id,
			}),
			quantity: 1,
			external_id: null,
			previous_customer_product_id: null,
			stripe_checkout_session_id: null,
		},
		toEntity,
	});
	const fullProduct = cusProductToProduct({
		cusProduct: duplicatedCustomerProduct,
	});

	return {
		...duplicatedCustomerProduct,
		customer_entitlements: duplicatedCustomerProduct.customer_entitlements.map(
			(customerEntitlement) => {
				const { balance, entities } = initCustomerEntitlementBalance({
					initContext: {
						fullCustomer,
						fullProduct,
						featureQuantities: duplicatedCustomerProduct.options,
					},
					entitlement: customerEntitlement.entitlement,
				});

				return {
					...customerEntitlement,
					balance,
					adjustment: 0,
					additional_balance: 0,
					entities,
					cache_version: 0,
					external_id: null,
					internal_entity_id: null,
					replaceables: [],
					rollovers: [],
				};
			},
		),
	};
};

const computeSourceOrdinaryBalanceDecrements = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}): SourceOrdinaryBalanceDecrement[] => {
	const oneUnitCustomerProduct = {
		...customerProduct,
		quantity: 1,
	};
	const fullProduct = cusProductToProduct({
		cusProduct: oneUnitCustomerProduct,
	});

	return customerProduct.customer_entitlements.flatMap(
		(customerEntitlement) => {
			if (
				customerEntitlement.entitlement.feature.type === FeatureType.Boolean ||
				isPooledSourceCustomerEntitlement({
					customerEntitlement,
					customerProduct,
				})
			)
				return [];

			const { balance } = initCustomerEntitlementBalance({
				initContext: {
					fullCustomer,
					fullProduct,
					featureQuantities: customerProduct.options,
				},
				entitlement: customerEntitlement.entitlement,
			});
			if (balance === 0) return [];

			return [
				{
					customerEntitlementId: customerEntitlement.id,
					amount: balance,
				},
			];
		},
	);
};

export const customerProductHasPooledCatalogEntitlement = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): boolean =>
	customerProduct.customer_entitlements.some(
		(customerEntitlement) => customerEntitlement.entitlement.pooled === true,
	);

export const computePooledFullTransferPlan = ({
	fullCustomer,
	customerProduct,
	toEntity,
	now,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	toEntity: Entity | null;
	now: number;
}): {
	updatedCustomerProduct: FullCusProduct;
	pooledBalanceOps: PooledBalanceOp[];
	restoreOrdinaryCustomerEntitlements: RestoreOrdinaryCustomerEntitlement[];
} => {
	const updatedCustomerProduct = withTransferEntity({
		customerProduct,
		toEntity,
	});
	const sourceIsManaged = customerProductHasPooledSource({ customerProduct });
	const destinationIsManaged = customerProductHasPooledSource({
		customerProduct: updatedCustomerProduct,
	});

	if (!sourceIsManaged && destinationIsManaged) {
		const prepared = prepareManagedSource({
			fullCustomer,
			customerProduct: updatedCustomerProduct,
			currentCustomerProduct: customerProduct,
			now,
		});
		return {
			updatedCustomerProduct: prepared.customerProduct,
			pooledBalanceOps: prepared.pooledBalanceOps,
			restoreOrdinaryCustomerEntitlements: [],
		};
	}

	if (sourceIsManaged && !destinationIsManaged) {
		const removalOperation = customerProductToPooledBalanceRemovalOp({
			customerProduct,
			effectiveAt: null,
		});
		return {
			updatedCustomerProduct,
			pooledBalanceOps: removalOperation ? [removalOperation] : [],
			restoreOrdinaryCustomerEntitlements: restoreOrdinaryPooledEntitlements({
				fullCustomer,
				customerProduct: updatedCustomerProduct,
			}),
		};
	}

	return {
		updatedCustomerProduct,
		pooledBalanceOps: [],
		restoreOrdinaryCustomerEntitlements: [],
	};
};

export const computePooledSplitTransferPlan = ({
	fullCustomer,
	customerProduct,
	toEntity,
	now,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	toEntity: Entity | null;
	now: number;
}): {
	sourceQuantity: number;
	sourceOrdinaryBalanceDecrements: SourceOrdinaryBalanceDecrement[];
	transferredCustomerProduct: FullCusProduct;
	pooledBalanceOps: PooledBalanceOp[];
} => {
	const sourceQuantity = customerProduct.quantity - 1;
	const sourceCustomerProduct = {
		...customerProduct,
		quantity: sourceQuantity,
	};
	let transferredCustomerProduct = initializeSplitCustomerProduct({
		fullCustomer,
		customerProduct,
		toEntity,
	});
	const pooledBalanceOps: PooledBalanceOp[] = [];

	if (
		customerProductHasPooledSource({ customerProduct: sourceCustomerProduct })
	) {
		const preparedSource = prepareManagedSource({
			fullCustomer,
			customerProduct: sourceCustomerProduct,
			currentCustomerProduct: customerProduct,
			now,
		});
		pooledBalanceOps.push(...preparedSource.pooledBalanceOps);
	}

	if (
		customerProductHasPooledSource({
			customerProduct: transferredCustomerProduct,
		})
	) {
		const preparedTransfer = prepareManagedSource({
			fullCustomer,
			customerProduct: transferredCustomerProduct,
			currentCustomerProduct: customerProductHasPooledSource({
				customerProduct,
			})
				? customerProduct
				: undefined,
			now,
		});
		transferredCustomerProduct = preparedTransfer.customerProduct;
		pooledBalanceOps.push(...preparedTransfer.pooledBalanceOps);
	}

	return {
		sourceQuantity,
		sourceOrdinaryBalanceDecrements: computeSourceOrdinaryBalanceDecrements({
			fullCustomer,
			customerProduct,
		}),
		transferredCustomerProduct,
		pooledBalanceOps,
	};
};
