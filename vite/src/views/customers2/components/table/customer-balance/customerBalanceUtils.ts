import {
	cusEntsToBalance,
	type DeleteBalanceParamsV0,
	EntInterval,
	type Entity,
	type FullCusEntWithFullCusProduct,
	isPaidCustomerEntitlement,
} from "@autumn/shared";

export const getCustomerBalanceId = ({
	balance,
}: {
	balance: FullCusEntWithFullCusProduct;
}) => balance.external_id ?? balance.id;

export const canDeleteCustomerBalance = ({
	balance,
}: {
	balance: FullCusEntWithFullCusProduct;
}) => !isPaidCustomerEntitlement(balance);

export function getCustomerBalanceSourceParts({
	balance,
	entities,
}: {
	balance: FullCusEntWithFullCusProduct;
	entities: Entity[];
}) {
	const productName = balance.customer_product?.product.name || "No plan";

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
}: {
	balance: FullCusEntWithFullCusProduct;
	entities: Entity[];
}) {
	const { productName, intervalLabel, entityName } =
		getCustomerBalanceSourceParts({ balance, entities });
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
