import type {
	FullCustomer,
	SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerToScopedBalances } from "./balances/customerToScopedBalances";
import { diffScopedBalances } from "./balances/diffScopedBalances";
import { withOneOffPrepaidCarryOvers } from "./balances/withOneOffPrepaidCarryOvers";
import { customerAsOf } from "./customerAsOf";
import { withoutRepeatsOfPreviousPhase } from "./withoutRepeatsOfPreviousPhase";

// Reset dates move on with the calendar, so a later phase repeats a change whatever its dates read.
const balanceChangeSignature = ({
	entity_id,
	feature_id,
	behavior,
	previous_attributes: {
		next_reset_at: previousResetAt,
		...previousAttributes
	},
	balance: { next_reset_at: _resetAt, ...balance },
	pooled,
}: SetPlansPreviewBalanceChange) =>
	JSON.stringify([
		entity_id,
		feature_id,
		behavior,
		previousAttributes,
		previousResetAt !== undefined,
		balance,
		pooled,
	]);

/**
 * Each phase's balances against what it is compared with: its saved self when given,
 * else the phase before it as of this phase's start (the customer as it is now, for the first phase).
 */
export const setPlansPhaseBalanceChanges = async ({
	ctx,
	originalFullCustomer,
	phaseCustomers,
	phaseStarts,
	savedComparisonCustomers = [],
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	phaseCustomers: FullCustomer[];
	phaseStarts: number[];
	savedComparisonCustomers?: (FullCustomer | undefined)[];
}): Promise<SetPlansPreviewBalanceChange[][]> => {
	const toBalances = (fullCustomer: FullCustomer) =>
		customerToScopedBalances({ ctx, fullCustomer });
	const carriedPhaseCustomers = withOneOffPrepaidCarryOvers({
		originalFullCustomer,
		phaseCustomers,
	});
	const [phaseBalances, previousPhaseBalances, savedBalances] =
		await Promise.all([
			Promise.all(carriedPhaseCustomers.map(toBalances)),
			Promise.all(
				carriedPhaseCustomers.map((_, phaseIndex) => {
					const previousCustomer = carriedPhaseCustomers[phaseIndex - 1];
					return toBalances(
						previousCustomer
							? customerAsOf({
									fullCustomer: previousCustomer,
									at: phaseStarts[phaseIndex],
								})
							: originalFullCustomer,
					);
				}),
			),
			Promise.all(
				savedComparisonCustomers.map((savedCustomer) =>
					savedCustomer ? toBalances(savedCustomer) : undefined,
				),
			),
		]);

	return withoutRepeatsOfPreviousPhase({
		phases: phaseBalances.map((after, phaseIndex) =>
			diffScopedBalances({
				before: savedBalances[phaseIndex] ?? previousPhaseBalances[phaseIndex],
				after,
			}),
		),
		signature: balanceChangeSignature,
	});
};
