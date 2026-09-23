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

/** The rollovers a new grant keeps once its cap is applied, as `RolloverService.insert` leaves them. */
const cappedRollovers = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct?: FullCusProduct;
}) => {
	const { rollovers } = customerEntitlement;
	// A new grant has no stored rollovers yet: only the carried ones count against its cap.
	// A copy, since the clearing sorts its rows in place and these are the plan's.
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

/** A new grant, and its carried rollovers when its product is live, as the Postgres lane inserts them. */
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
