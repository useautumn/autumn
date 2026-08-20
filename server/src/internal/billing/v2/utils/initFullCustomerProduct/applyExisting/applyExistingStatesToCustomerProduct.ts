import type {
	BalanceTransition,
	BalanceTransitionPlan,
	ExistingRollover,
	ExistingRolloversConfig,
	ExistingUsages,
	ExistingUsagesConfig,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	cusProductsToCusEnts,
	filterCustomerProductsByActiveStatuses,
	isCustomerProductAddOn,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";

const buildBalanceTransitionPlan = ({
	fromCustomerProduct,
	targetCustomerProduct,
	internalFeatureIds,
}: {
	fromCustomerProduct: FullCusProduct;
	targetCustomerProduct: FullCusProduct;
	internalFeatureIds: string[];
}): BalanceTransitionPlan => {
	const id = targetCustomerProduct.id;
	const transitions: BalanceTransition[] = [];
	const mappedSourceIds = new Set<string>();

	for (const internalFeatureId of internalFeatureIds) {
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
			return {
				id,
				outgoingCustomerEntitlements: fromCustomerProduct.customer_entitlements,
				transitions,
				unsupportedReason: "multi_entitlement_feature",
			};
		}

		const [sourceCustomerEntitlement] = sourceCustomerEntitlements;
		const [targetCustomerEntitlement] = targetCustomerEntitlements;
		if (
			typeof sourceCustomerEntitlement.balance !== "number" ||
			!Number.isFinite(sourceCustomerEntitlement.balance) ||
			typeof targetCustomerEntitlement.balance !== "number" ||
			!Number.isFinite(targetCustomerEntitlement.balance)
		) {
			return {
				id,
				outgoingCustomerEntitlements: fromCustomerProduct.customer_entitlements,
				transitions,
				unsupportedReason: "non_numeric_balance",
			};
		}

		transitions.push({
			sourceCustomerEntitlementId: sourceCustomerEntitlement.id,
			targetCustomerEntitlementId: targetCustomerEntitlement.id,
			sourceBalance: sourceCustomerEntitlement.balance,
			sourceAdjustment: sourceCustomerEntitlement.adjustment ?? 0,
		});
		mappedSourceIds.add(sourceCustomerEntitlement.id);
	}

	const hasUnmappedRuntimeBalance =
		fromCustomerProduct.customer_entitlements.some(
			(customerEntitlement) =>
				typeof customerEntitlement.balance === "number" &&
				!mappedSourceIds.has(customerEntitlement.id),
		);

	return {
		id,
		outgoingCustomerEntitlements: fromCustomerProduct.customer_entitlements,
		transitions,
		unsupportedReason: hasUnmappedRuntimeBalance
			? "unmapped_runtime_balance"
			: undefined,
	};
};

const getEntitiesForExistingUsage = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}) => {
	if (!isCustomerProductAddOn(customerProduct)) return fullCustomer.entities;

	const activeCustomerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: fullCustomer.customer_products,
	});
	const coveredInternalFeatureIds = new Set(
		cusProductsToCusEnts({ cusProducts: activeCustomerProducts }).map(
			(customerEntitlement) => customerEntitlement.internal_feature_id,
		),
	);
	return fullCustomer.entities.filter(
		(entity) => !coveredInternalFeatureIds.has(entity.internal_feature_id),
	);
};

export const applyExistingStatesToCustomerProduct = ({
	ctx,
	fullCustomer,
	customerProduct,
	existingUsagesConfig,
	existingRolloversConfig,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	existingUsagesConfig?: ExistingUsagesConfig;
	existingRolloversConfig?: ExistingRolloversConfig;
}): BalanceTransitionPlan | undefined => {
	let existingUsages: ExistingUsages = {};
	let balanceTransitionPlan: BalanceTransitionPlan | undefined;

	if (existingUsagesConfig) {
		const { fromCustomerProduct } = existingUsagesConfig;

		existingUsages = cusProductToExistingUsages({
			cusProduct: fromCustomerProduct,
			entityId: fullCustomer.entity?.id ?? undefined,
			...existingUsagesConfig,
		});
		balanceTransitionPlan = buildBalanceTransitionPlan({
			fromCustomerProduct,
			targetCustomerProduct: customerProduct,
			internalFeatureIds: Object.keys(existingUsages),
		});
	}

	applyExistingUsages({
		ctx,
		customerProduct,
		existingUsages,
		entities: getEntitiesForExistingUsage({
			fullCustomer,
			customerProduct,
		}),
	});

	let existingRollovers: ExistingRollover[] = [];

	if (existingRolloversConfig) {
		const { fromCustomerProduct } = existingRolloversConfig;

		existingRollovers = cusProductToExistingRollovers({
			cusProduct: fromCustomerProduct,
		});
	}

	applyExistingRollovers({
		customerProduct,
		existingRollovers,
	});

	return balanceTransitionPlan;
};
