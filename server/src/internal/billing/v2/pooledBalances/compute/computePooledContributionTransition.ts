import { Decimal } from "decimal.js";
import { assertPooledContributionAmount } from "./assertPooledContributionAmount.js";

export type PooledContributionAmounts = {
	currentCycleContribution: number;
	nextCycleContribution: number;
};

export type PooledContributionTransition = {
	contributionDelta: number;
	next: PooledContributionAmounts;
};

const assertPooledContributionAmounts = ({
	amounts,
}: {
	amounts: PooledContributionAmounts;
}) => {
	assertPooledContributionAmount({
		field: "currentCycleContribution",
		value: amounts.currentCycleContribution,
	});
	assertPooledContributionAmount({
		field: "nextCycleContribution",
		value: amounts.nextCycleContribution,
	});
};

export const computePooledContributionTransition = ({
	previous,
	desired,
}: {
	previous: PooledContributionAmounts | null;
	desired: PooledContributionAmounts;
}): PooledContributionTransition => {
	if (previous) {
		assertPooledContributionAmounts({ amounts: previous });
	}
	assertPooledContributionAmounts({ amounts: desired });

	const previousCurrentContribution = previous?.currentCycleContribution ?? 0;
	const contributionDelta = new Decimal(desired.currentCycleContribution)
		.minus(previousCurrentContribution)
		.toNumber();

	return {
		contributionDelta,
		next: {
			currentCycleContribution: desired.currentCycleContribution,
			nextCycleContribution: desired.nextCycleContribution,
		},
	};
};
