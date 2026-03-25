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

export function getCustomerBalanceSourceLabel({
	balance,
	entities,
}: {
	balance: FullCusEntWithFullCusProduct;
	entities: Entity[];
}) {
	const parts: string[] = [];

	parts.push(balance.customer_product?.product.name || "No plan");

	const { interval, interval_count } = balance.entitlement;
	if (!interval || interval === EntInterval.Lifetime) {
		parts.push("Lifetime");
	} else {
		const count = interval_count || 1;
		parts.push(count > 1 ? `${count} ${interval}s` : interval);
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

	if (entity) {
		parts.push(entity.name || entity.id);
	}

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
