import type {
	FullCustomer,
	SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerToScopedBalances } from "./balances/customerToScopedBalances";
import { diffScopedBalances } from "./balances/diffScopedBalances";
import { withOneOffPrepaidCarryOvers } from "./balances/withOneOffPrepaidCarryOvers";
import { withoutRepeatsOfPreviousPhase } from "./withoutRepeatsOfPreviousPhase";

const balanceChangeSignature = ({
	entity_id,
	feature_id,
	behavior,
	previous_attributes,
	balance,
	pooled,
}: SetPlansPreviewBalanceChange) =>
	JSON.stringify([
		entity_id,
		feature_id,
		behavior,
		previous_attributes,
		balance,
		pooled,
	]);

/**
 * Each phase's balances against what it is compared with: its saved self when given,
 * else the phase before it (the customer as it is now, for the first phase).
 */
export const setPlansPhaseBalanceChanges = async ({
	ctx,
	originalFullCustomer,
	phaseCustomers,
	savedComparisonCustomers = [],
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	phaseCustomers: FullCustomer[];
	savedComparisonCustomers?: (FullCustomer | undefined)[];
}): Promise<SetPlansPreviewBalanceChange[][]> => {
	const toBalances = (fullCustomer: FullCustomer) =>
		customerToScopedBalances({ ctx, fullCustomer });
	const [phaseBalances, previousBalances, savedBalances] = await Promise.all([
		Promise.all(
			withOneOffPrepaidCarryOvers({ originalFullCustomer, phaseCustomers }).map(
				toBalances,
			),
		),
		toBalances(originalFullCustomer),
		Promise.all(
			savedComparisonCustomers.map((savedCustomer) =>
				savedCustomer ? toBalances(savedCustomer) : undefined,
			),
		),
	]);

	return withoutRepeatsOfPreviousPhase({
		phases: phaseBalances.map((after, phaseIndex) =>
			diffScopedBalances({
				before:
					savedBalances[phaseIndex] ??
					phaseBalances[phaseIndex - 1] ??
					previousBalances,
				after,
			}),
		),
		signature: balanceChangeSignature,
	});
};
