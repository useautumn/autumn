import { Decimal } from "decimal.js";
import type {
	BalanceMutation,
	LeanCustomerEntitlement,
	TrackCommand,
} from "../contracts.js";

export const computeDeduction = ({
	customerEntitlements,
	value,
	overageBehavior,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
	value: Decimal;
	overageBehavior: TrackCommand["overageBehavior"];
}): { appliedValue: Decimal; mutations: BalanceMutation[] } => {
	const availableBalance = customerEntitlements.reduce(
		(total, customerEntitlement) =>
			total.plus(Decimal.max(customerEntitlement.balance, 0)),
		new Decimal(0),
	);
	const appliedValue =
		overageBehavior === "cap" ? Decimal.min(value, availableBalance) : value;
	let remainingValue = appliedValue;
	const mutations: BalanceMutation[] = [];

	for (const customerEntitlement of customerEntitlements) {
		if (remainingValue.lte(0)) break;

		const balance = new Decimal(customerEntitlement.balance);
		const deductedValue = Decimal.min(remainingValue, Decimal.max(balance, 0));
		if (deductedValue.lte(0)) continue;

		mutations.push({
			customerEntitlementId: customerEntitlement.id,
			balanceBefore: customerEntitlement.balance,
			balanceAfter: balance.minus(deductedValue).toNumber(),
			usageBefore: customerEntitlement.usage,
			usageAfter: new Decimal(customerEntitlement.usage)
				.plus(deductedValue)
				.toNumber(),
		});
		remainingValue = remainingValue.minus(deductedValue);
	}

	if (overageBehavior === "overflow" && remainingValue.gt(0)) {
		const overflowCustomerEntitlement = customerEntitlements.at(-1);
		if (!overflowCustomerEntitlement) return { appliedValue, mutations };

		const existingMutation = mutations.find(
			(mutation) =>
				mutation.customerEntitlementId === overflowCustomerEntitlement.id,
		);
		const balanceBefore =
			existingMutation?.balanceBefore ?? overflowCustomerEntitlement.balance;
		const usageBefore =
			existingMutation?.usageBefore ?? overflowCustomerEntitlement.usage;
		const overflowMutation: BalanceMutation = {
			customerEntitlementId: overflowCustomerEntitlement.id,
			balanceBefore,
			balanceAfter: new Decimal(
				existingMutation?.balanceAfter ?? overflowCustomerEntitlement.balance,
			)
				.minus(remainingValue)
				.toNumber(),
			usageBefore,
			usageAfter: new Decimal(
				existingMutation?.usageAfter ?? overflowCustomerEntitlement.usage,
			)
				.plus(remainingValue)
				.toNumber(),
		};

		if (existingMutation) {
			mutations[mutations.indexOf(existingMutation)] = overflowMutation;
		} else {
			mutations.push(overflowMutation);
		}
	}

	return { appliedValue, mutations };
};

export const balanceAfterMutations = ({
	customerEntitlements,
	mutations,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
	mutations: BalanceMutation[];
}): number => {
	const mutationByCustomerEntitlementId = new Map(
		mutations.map((mutation) => [mutation.customerEntitlementId, mutation]),
	);

	return customerEntitlements
		.reduce(
			(total, customerEntitlement) =>
				total.plus(
					mutationByCustomerEntitlementId.get(customerEntitlement.id)
						?.balanceAfter ?? customerEntitlement.balance,
				),
			new Decimal(0),
		)
		.toNumber();
};
