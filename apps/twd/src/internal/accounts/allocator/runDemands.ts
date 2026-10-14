import type { ClaimedAccount } from "../actions/accountLedger.ts";

export type RunDemand = {
	wants: number;
	deliver: (accounts: ClaimedAccount[]) => void;
};

export const runDemands = new Map<string, RunDemand>();

export const getRunDemand = ({ runId }: { runId: string }) =>
	runDemands.get(runId)?.wants;
