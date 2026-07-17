import type { PooledBalanceReset } from "../compute/computePooledBalanceReset.js";
import type { PooledBalanceResetPlan } from "./computePooledBalanceResetPlan.js";

type RolloverInsert = NonNullable<PooledBalanceResetPlan["rolloverInsert"]>;

export const persistPooledBalanceResetPlan = async ({
	plan,
	applyReset,
	insertRollovers,
}: {
	plan: PooledBalanceResetPlan;
	applyReset: ({ reset }: { reset: PooledBalanceReset }) => Promise<boolean>;
	insertRollovers: ({
		rolloverInsert,
		startingBalance,
	}: {
		rolloverInsert: RolloverInsert;
		startingBalance: number;
	}) => Promise<void>;
}): Promise<boolean> => {
	const applied = await applyReset({ reset: plan.reset });
	if (!applied) return false;

	if (plan.rolloverInsert) {
		await insertRollovers({
			rolloverInsert: plan.rolloverInsert,
			startingBalance: plan.reset.resetBalance,
		});
	}

	return true;
};
