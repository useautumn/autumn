import type { RunStatus } from "../../../db/schema/runs.ts";

type LiveRunDemand = {
	id: string;
	status: RunStatus;
	workersWanted: number | null;
};

export const summariseAccountDemand = ({
	liveRuns,
	heldByRun,
	demandOf,
}: {
	liveRuns: LiveRunDemand[];
	heldByRun: Map<string, number>;
	demandOf: (runId: string) => number | undefined;
}) => {
	let accountsWanted = 0;
	let slotsAwaitingWarm = 0;
	for (const run of liveRuns) {
		const unmet = Math.max(
			0,
			(run.workersWanted ?? 0) - (heldByRun.get(run.id) ?? 0),
		);
		if (run.status === "warming") slotsAwaitingWarm += unmet;
		else accountsWanted += Math.min(unmet, demandOf(run.id) ?? 0);
	}
	return { accountsWanted, slotsAwaitingWarm };
};
