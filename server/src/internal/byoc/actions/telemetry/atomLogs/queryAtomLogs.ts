import { getAtomAxiomClient } from "@/external/axiom/initAxiom.js";
import { queryAxiomTabular } from "@/external/axiom/queryAxiom.js";
import { escapeApl } from "@/external/axiom/utils/aplUtils.js";

/** Where alien's log export sends every Atom's stdout. */
const ATOM_LOGS_DATASET = "atom";

/** Runs an APL pipeline over one Atom's log lines, from `startTime` until now; none where the token is unset. */
export const queryAtomLogs = async ({
	deploymentId,
	pipeline,
	startTime,
}: {
	deploymentId: string;
	pipeline: string;
	startTime: string;
}) => {
	const client = getAtomAxiomClient();
	if (!client) return [];
	return queryAxiomTabular({
		client,
		apl: `['${ATOM_LOGS_DATASET}'] | where ['attributes.horizon.cluster_id'] == '${escapeApl(deploymentId)}' ${pipeline}`,
		options: { startTime, endTime: "now" },
	});
};
