import type { ClaimedAccount } from "../actions/accountLedger.ts";

/** A swarm job ready to take accounts. The allocator lowers `wants` by what it delivers. */
export type RunDemand = {
	wants: number;
	deliver: (accounts: ClaimedAccount[]) => void;
};

/** Runs currently asking the allocator for accounts; kept apart so read paths don't import the allocator. */
export const runDemands = new Map<string, RunDemand>();

/** Accounts a registered run can still use now; undefined when the run is not taking accounts. */
export const getRunDemand = ({ runId }: { runId: string }) =>
	runDemands.get(runId)?.wants;
