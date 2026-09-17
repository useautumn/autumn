import { Decimal } from "decimal.js";
import type { OverageBehavior } from "../../commands/track/types/trackCommand.js";
import type { RowChange } from "../../models/rowChange.js";
import type { WorkerCustomerEntitlement } from "../../models/rows/workerCustomerEntitlement.js";
import { availableBalanceOf } from "../../utils/customerStateUtils/balanceOf.js";

const deductionChangeOf = ({
	customerEntitlement,
	deductedValue,
}: {
	customerEntitlement: WorkerCustomerEntitlement;
	deductedValue: Decimal;
}): RowChange => ({
	table: "customerEntitlements",
	op: "update",
	id: customerEntitlement.id,
	before: { balance: customerEntitlement.balance },
	after: {
		balance: new Decimal(customerEntitlement.balance)
			.minus(deductedValue)
			.toNumber(),
	},
});

/** Drains rows in the order given; overflow drives the last row negative instead of refusing the remainder. */
export const computeDeduction = ({
	customerEntitlements,
	value,
	overageBehavior,
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	value: Decimal;
	overageBehavior: OverageBehavior;
}): { appliedValue: Decimal; changes: RowChange[] } => {
	const appliedValue =
		overageBehavior === "cap"
			? Decimal.min(value, availableBalanceOf({ customerEntitlements }))
			: value;
	const deductedById = new Map<string, Decimal>();
	let remainingValue = appliedValue;

	for (const customerEntitlement of customerEntitlements) {
		if (remainingValue.lte(0)) break;

		const deductedValue = Decimal.min(
			remainingValue,
			Decimal.max(customerEntitlement.balance, 0),
		);
		if (deductedValue.lte(0)) continue;

		deductedById.set(customerEntitlement.id, deductedValue);
		remainingValue = remainingValue.minus(deductedValue);
	}

	const overflowCustomerEntitlement = customerEntitlements.at(-1);
	if (
		overageBehavior === "overflow" &&
		remainingValue.gt(0) &&
		overflowCustomerEntitlement
	) {
		const alreadyDeducted =
			deductedById.get(overflowCustomerEntitlement.id) ?? new Decimal(0);
		deductedById.set(
			overflowCustomerEntitlement.id,
			alreadyDeducted.plus(remainingValue),
		);
	}

	const changes = customerEntitlements.flatMap((customerEntitlement) => {
		const deductedValue = deductedById.get(customerEntitlement.id);
		if (!deductedValue) return [];

		return [deductionChangeOf({ customerEntitlement, deductedValue })];
	});

	return { appliedValue, changes };
};
