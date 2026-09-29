import {
	type BalanceListRow,
	type BalanceListStatus,
	type CustomerEntitlementWithPricesView,
	cusEntsToRollovers,
	getApiBalanceBreakdownItemV2,
} from "@autumn/shared";

export type ListedCustomerEntitlementRow = {
	internal_customer_id: string;
	created_at: number | string;
	id: string;
	customer_public_id: string | null;
	entity_public_id: string | null;
	list_status: BalanceListStatus;
	customer_entitlement: CustomerEntitlementWithPricesView;
};

export const customerEntitlementToListRow = ({
	row,
}: {
	row: ListedCustomerEntitlementRow;
}): BalanceListRow => {
	const customerEntitlement = row.customer_entitlement;
	const {
		object: _object,
		overage: _overage,
		...breakdown
	} = getApiBalanceBreakdownItemV2({
		fullSubject: { entity: null },
		customerEntitlement,
	});

	return {
		...breakdown,
		feature_id: customerEntitlement.entitlement.feature.id,
		status: row.list_status,
		rollovers: cusEntsToRollovers({ cusEnts: [customerEntitlement] }) ?? [],
		customer_id: row.customer_public_id ?? row.internal_customer_id,
		entity_id: row.entity_public_id,
		created_at: Number(row.created_at),
	};
};
