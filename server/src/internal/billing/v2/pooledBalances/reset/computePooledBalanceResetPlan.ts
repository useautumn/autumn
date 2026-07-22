import {
	type FullCusEntWithProduct,
	isLifetimeEntitlement,
	type Rollover,
} from "@autumn/shared";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
import {
	computePooledBalanceReset,
	type PooledBalanceReset,
	type PooledBalanceResetContribution,
} from "../compute/computePooledBalanceReset.js";

export type PooledBalanceResetPlan = {
	reset: PooledBalanceReset;
	rolloverInsert?: {
		rows: Rollover[];
		fullCusEnt: FullCusEntWithProduct;
		startingBalanceOverride: number;
	};
};

export const computePooledBalanceResetPlan = ({
	customerEntitlement,
	resetAt,
	asOf = resetAt,
	lastAppliedResetAt,
	contributions,
}: {
	customerEntitlement: FullCusEntWithProduct;
	resetAt: number;
	asOf?: number;
	lastAppliedResetAt: number | null;
	contributions: PooledBalanceResetContribution[];
}): PooledBalanceResetPlan | null => {
	if (
		isLifetimeEntitlement({
			entitlement: customerEntitlement.entitlement,
		})
	) {
		return null;
	}

	const reset = computePooledBalanceReset({
		resetAt,
		asOf,
		lastAppliedResetAt,
		contributions,
	});
	if (!reset) return null;

	const rolloverRows = getRolloverUpdates({
		cusEnt: customerEntitlement,
		nextResetAt: resetAt,
	}).toInsert;

	return {
		reset,
		...(rolloverRows.length > 0
			? {
					rolloverInsert: {
						rows: rolloverRows,
						fullCusEnt: customerEntitlement,
						startingBalanceOverride: reset.resetBalance,
					},
				}
			: {}),
	};
};
