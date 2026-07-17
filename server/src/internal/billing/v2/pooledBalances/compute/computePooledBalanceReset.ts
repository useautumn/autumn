import { InternalError } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { assertPooledContributionAmount } from "./assertPooledContributionAmount.js";
import type { PooledContributionAmounts } from "./computePooledContributionTransition.js";

export type PooledBalanceResetContribution = PooledContributionAmounts & {
	id: string;
	effectiveAt?: number | null;
};

export type PooledBalanceReset = {
	resetBalance: number;
	resetAdjustment: number;
	lastAppliedResetAt: number;
	contributions: PooledBalanceResetContribution[];
};

const assertResetTimestamp = ({
	field,
	value,
}: {
	field: "resetAt" | "lastAppliedResetAt";
	value: number;
}) => {
	if (Number.isFinite(value)) return;

	throw new InternalError({
		message: `${field} must be finite`,
		data: { field, value },
	});
};

export const computePooledBalanceReset = ({
	resetAt,
	asOf = resetAt,
	lastAppliedResetAt,
	contributions,
}: {
	resetAt: number;
	asOf?: number;
	lastAppliedResetAt: number | null;
	contributions: PooledBalanceResetContribution[];
}): PooledBalanceReset | null => {
	assertResetTimestamp({ field: "resetAt", value: resetAt });
	assertResetTimestamp({ field: "resetAt", value: asOf });
	if (lastAppliedResetAt !== null) {
		assertResetTimestamp({
			field: "lastAppliedResetAt",
			value: lastAppliedResetAt,
		});
		if (lastAppliedResetAt >= resetAt) return null;
	}

	let resetGrant = new Decimal(0);
	const nextContributions = contributions.map((contribution) => {
		assertPooledContributionAmount({
			field: "currentCycleContribution",
			value: contribution.currentCycleContribution,
		});
		assertPooledContributionAmount({
			field: "nextCycleContribution",
			value: contribution.nextCycleContribution,
		});
		if (typeof contribution.effectiveAt === "number") {
			assertResetTimestamp({
				field: "resetAt",
				value: contribution.effectiveAt,
			});
		}

		const appliesNextContribution =
			contribution.effectiveAt === undefined ||
			contribution.effectiveAt === null ||
			contribution.effectiveAt <= asOf;
		const currentCycleContribution = appliesNextContribution
			? contribution.nextCycleContribution
			: contribution.currentCycleContribution;
		resetGrant = resetGrant.plus(currentCycleContribution);

		return {
			...contribution,
			currentCycleContribution,
			...(contribution.effectiveAt !== undefined
				? {
						effectiveAt: appliesNextContribution
							? null
							: contribution.effectiveAt,
					}
				: {}),
		};
	});

	const resetAmount = resetGrant.toNumber();
	return {
		resetBalance: resetAmount,
		resetAdjustment: resetAmount,
		lastAppliedResetAt: resetAt,
		contributions: nextContributions,
	};
};
