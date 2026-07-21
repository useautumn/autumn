import { Decimal } from "decimal.js";

export type PooledTransferGrantDelta = {
	pooledBalanceId: string;
	balanceDelta: number;
	adjustmentDelta: number;
};

/** Moves only one contribution's grant between pools. Usage distribution is
 * deliberately left to the shared pooled rebalance/global deduction kernel. */
export const computePooledTransferGrantDeltas = ({
	previousPooledBalanceId,
	destinationPooledBalanceId,
	previousContribution,
	desiredContribution,
}: {
	previousPooledBalanceId: string;
	destinationPooledBalanceId: string;
	previousContribution: number;
	desiredContribution: number;
}): PooledTransferGrantDelta[] => {
	if (previousPooledBalanceId === destinationPooledBalanceId) {
		const delta = new Decimal(desiredContribution)
			.minus(previousContribution)
			.toNumber();
		return [
			{
				pooledBalanceId: previousPooledBalanceId,
				balanceDelta: delta,
				adjustmentDelta: delta,
			},
		];
	}

	return [
		{
			pooledBalanceId: previousPooledBalanceId,
			balanceDelta: new Decimal(previousContribution).negated().toNumber(),
			adjustmentDelta: new Decimal(previousContribution).negated().toNumber(),
		},
		{
			pooledBalanceId: destinationPooledBalanceId,
			balanceDelta: desiredContribution,
			adjustmentDelta: desiredContribution,
		},
	];
};
