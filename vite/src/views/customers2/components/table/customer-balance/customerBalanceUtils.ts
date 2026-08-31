import {
	cusEntsToBalance,
	type DeleteBalanceParamsV0,
	EntInterval,
	type Entity,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	filterCustomerEntitlementsByPooledBalanceSource,
	findCustomerLicenseByLinkId,
	findCustomerProductById,
	fullCustomerToCustomerEntitlements,
	fullCustomerToCustomerLicenses,
	hasRecalculableScope,
	isPaidCustomerEntitlement,
	isPooledBalanceSourceCustomerEntitlement,
	isSyntheticPooledBalanceCustomerEntitlement,
	type RecalculateBalanceParamsV0,
} from "@autumn/shared";

export const getCustomerBalanceId = ({
	balance,
}: {
	balance: FullCusEntWithFullCusProduct;
}) => balance.external_id ?? balance.id;

/** Pooled balances are owned by their contributing plans, not deletable on their own. */
export const canDeleteCustomerBalance = ({
	balance,
}: {
	balance: FullCusEntWithFullCusProduct;
}) =>
	!(
		isPaidCustomerEntitlement(balance) ||
		isSyntheticPooledBalanceCustomerEntitlement({
			customerEntitlement: balance,
		}) ||
		isPooledBalanceSourceCustomerEntitlement({ customerEntitlement: balance })
	);

type BalanceWithOptionalProduct = FullCustomerEntitlement & {
	customer_product?: { product: { name: string } } | null;
};

const getLicensePooledBalancePlanName = ({
	balance,
	fullCustomer,
}: {
	balance: BalanceWithOptionalProduct;
	fullCustomer: FullCustomer;
}) => {
	const customerLicense = findCustomerLicenseByLinkId({
		customerLicenses: fullCustomerToCustomerLicenses({ fullCustomer }),
		customerLicenseLinkId: balance.pooled_balance?.customer_license_link_id,
	});
	if (!customerLicense) return undefined;

	return (
		findCustomerProductById({
			fullCustomer,
			customerProductId: customerLicense.parent_customer_product_id,
		})?.product.name ?? customerLicense.planLicense?.product.name
	);
};

const getRegularPooledBalancePlanName = ({
	balance,
	fullCustomer,
}: {
	balance: BalanceWithOptionalProduct;
	fullCustomer: FullCustomer;
}) => {
	const pooledBalanceId =
		balance.pooled_balance_id ?? balance.pooled_balance?.id;
	if (!pooledBalanceId) return undefined;

	const planNames = new Set<string>();
	for (const customerProduct of fullCustomer.customer_products) {
		const contributes = filterCustomerEntitlementsByPooledBalanceSource({
			customerEntitlements: customerProduct.customer_entitlements,
		}).some(
			(customerEntitlement) =>
				customerEntitlement.pooled_balance_id === pooledBalanceId,
		);
		if (contributes && customerProduct.product.name) {
			planNames.add(customerProduct.product.name);
		}
	}

	if (planNames.size !== 1) return undefined;
	return [...planNames][0];
};

/** Plan that granted this balance. Pooled ents have no customer_product. */
export const getCustomerBalancePlanName = ({
	balance,
	fullCustomer,
}: {
	balance: BalanceWithOptionalProduct;
	fullCustomer?: FullCustomer | null;
}): string | undefined => {
	if (balance.customer_product?.product.name) {
		return balance.customer_product.product.name;
	}

	if (
		!fullCustomer ||
		!isSyntheticPooledBalanceCustomerEntitlement({
			customerEntitlement: balance,
		})
	) {
		return undefined;
	}

	if (balance.pooled_balance?.customer_license_link_id) {
		return getLicensePooledBalancePlanName({ balance, fullCustomer });
	}

	return getRegularPooledBalancePlanName({ balance, fullCustomer });
};

export function getCustomerBalanceSourceParts({
	balance,
	entities,
	fullCustomer,
}: {
	balance: FullCusEntWithFullCusProduct;
	entities: Entity[];
	fullCustomer?: FullCustomer | null;
}) {
	const isPooledBalance = isSyntheticPooledBalanceCustomerEntitlement({
		customerEntitlement: balance,
	});
	const productName =
		getCustomerBalancePlanName({ balance, fullCustomer }) ??
		(isPooledBalance ? "Pooled" : "No plan");

	const { interval, interval_count } = balance.entitlement;
	let intervalLabel: string;
	if (!interval || interval === EntInterval.Lifetime) {
		intervalLabel = "Lifetime";
	} else {
		const count = interval_count || 1;
		intervalLabel = count > 1 ? `${count} ${interval}s` : interval;
	}

	const entity = entities.find((candidate) => {
		if (balance.internal_entity_id) {
			return candidate.internal_id === balance.internal_entity_id;
		}

		return (
			candidate.internal_id === balance.customer_product?.internal_entity_id ||
			candidate.id === balance.customer_product?.entity_id
		);
	});

	const entityName = entity ? entity.name || entity.id : undefined;

	return { productName, intervalLabel, entityName };
}

export function getCustomerBalanceSourceLabel({
	balance,
	entities,
	fullCustomer,
}: {
	balance: FullCusEntWithFullCusProduct;
	entities: Entity[];
	fullCustomer?: FullCustomer | null;
}) {
	const { productName, intervalLabel, entityName } =
		getCustomerBalanceSourceParts({ balance, entities, fullCustomer });
	const parts = [productName, intervalLabel];
	if (entityName) parts.push(entityName);
	return parts.join(" · ");
}

export const getCustomerBalanceRemaining = ({
	balance,
	entityId,
}: {
	balance: FullCusEntWithFullCusProduct;
	entityId: string | null;
}) =>
	cusEntsToBalance({
		cusEnts: [balance],
		entityId: entityId ?? undefined,
		withRollovers: true,
	});

export const canRecalculateCustomerBalances = ({
	fullCustomer,
	featureId,
	entityId,
}: {
	fullCustomer: FullCustomer | null | undefined;
	featureId: string;
	entityId: string | null;
}) => {
	if (!fullCustomer) return false;
	const entity = entityId
		? fullCustomer.entities?.find(
				(candidate) =>
					candidate.id === entityId || candidate.internal_id === entityId,
			)
		: undefined;
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
		entity,
	});
	return hasRecalculableScope({ cusEnts, entityId: entity?.id ?? undefined });
};

export const getRecalculateBalanceParams = ({
	balance,
	customerId,
	entityId,
}: {
	balance: FullCusEntWithFullCusProduct;
	customerId: string;
	entityId: string | null;
}): RecalculateBalanceParamsV0 => ({
	customer_id: customerId,
	feature_id: balance.entitlement.feature.id,
	entity_id: entityId ?? undefined,
});

export const getDeleteBalanceParams = ({
	balance,
	customerId,
	entityId,
	recalculateBalances,
}: {
	balance: FullCusEntWithFullCusProduct;
	customerId: string;
	entityId: string | null;
	recalculateBalances?: boolean;
}): DeleteBalanceParamsV0 => ({
	customer_id: customerId,
	feature_id: balance.entitlement.feature.id,
	entity_id: entityId ?? undefined,
	balance_id: getCustomerBalanceId({ balance }),
	recalculate_balances: recalculateBalances || undefined,
});
