import {
	type BillingPlanOp,
	toBillingPlanInsertOp,
} from "@autumn/balance-engine";
import {
	customerProductHasActiveStatus,
	type FullCusProduct,
	type FullCustomerEntitlement,
	performMaximumClearing,
} from "@autumn/shared";

const cappedRollovers = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct?: FullCusProduct;
}) => {
	const { rollovers } = customerEntitlement;
	const { toDelete, toUpdate } = performMaximumClearing({
		rows: [...rollovers],
		cusEnt: {
			...customerEntitlement,
			customer_product: customerProduct ?? null,
		},
	});
	return rollovers
		.filter(({ id }) => !toDelete.includes(id))
		.map(
			(rollover) => toUpdate.find(({ id }) => id === rollover.id) ?? rollover,
		);
};

export const customerEntitlementToPlanOps = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct?: FullCusProduct;
}): BillingPlanOp[] => {
	const carriesRollovers =
		customerEntitlement.rollovers.length > 0 &&
		customerProductHasActiveStatus(customerProduct);
	return [
		toBillingPlanInsertOp({
			table: "customerEntitlements",
			row: customerEntitlement,
		}),
		...(carriesRollovers
			? cappedRollovers({ customerEntitlement, customerProduct }).map(
					(rollover) =>
						toBillingPlanInsertOp({ table: "rollovers", row: rollover }),
				)
			: []),
	];
};
