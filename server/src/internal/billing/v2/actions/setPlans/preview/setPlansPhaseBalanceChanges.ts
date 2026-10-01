import type {
	FullCustomer,
	SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerToScopedBalances } from "./balances/customerToScopedBalances";
import { diffBalanceTimelines } from "./balances/diffBalanceTimelines";
import { withOneOffPrepaidCarryOvers } from "./balances/withOneOffPrepaidCarryOvers";

/** Scoped balances before the first phase, then at each phase start. */
const timelineBalances = ({
	ctx,
	originalFullCustomer,
	phaseCustomers,
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	phaseCustomers: FullCustomer[];
}) =>
	Promise.all(
		[
			originalFullCustomer,
			...withOneOffPrepaidCarryOvers({ originalFullCustomer, phaseCustomers }),
		].map((fullCustomer) => customerToScopedBalances({ ctx, fullCustomer })),
	);

/**
 * Each phase's balance changes at its start, against the customer just before it.
 * With the saved timeline, a change the saved schedule already makes is marked `saved`.
 */
export const setPlansPhaseBalanceChanges = async ({
	ctx,
	originalFullCustomer,
	phaseCustomers,
	savedPhaseCustomers,
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	phaseCustomers: FullCustomer[];
	savedPhaseCustomers?: FullCustomer[];
}): Promise<SetPlansPreviewBalanceChange[][]> => {
	const [desired, saved] = await Promise.all([
		timelineBalances({ ctx, originalFullCustomer, phaseCustomers }),
		savedPhaseCustomers
			? timelineBalances({
					ctx,
					originalFullCustomer,
					phaseCustomers: savedPhaseCustomers,
				})
			: undefined,
	]);

	return diffBalanceTimelines({ desired, saved });
};
