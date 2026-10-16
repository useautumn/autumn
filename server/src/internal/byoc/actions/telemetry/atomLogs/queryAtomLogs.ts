import { getAtomAxiomClient } from "@/external/axiom/initAxiom.js";
import { queryAxiomTabular } from "@/external/axiom/queryAxiom.js";
import { escapeApl } from "@/external/axiom/utils/aplUtils.js";

/** Where alien's log export sends every Atom's stdout. */
const ATOM_LOGS_DATASET = "atom";

/** Each log line's JSON as `line`: alien's export moved it from `body` (now just the msg) into `log.record.original`; older rows keep it in `body`. */
export const ATOM_LINE_EXTEND = `| extend line = iff(isnotempty(tostring(['attributes.log.record.original'])), tostring(['attributes.log.record.original']), tostring(body))`;

/** Keeps only the health line each replica logs every 10s, with its unsampled counters. */
export const ATOM_HEALTH_LINES = `| where line contains '"atom_health"'`;

/** Runs an APL pipeline over one Atom's log lines, each as `line`, from `startTime` until now; none where the token is unset. */
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
		apl: `['${ATOM_LOGS_DATASET}'] | where ['attributes.horizon.cluster_id'] == '${escapeApl(deploymentId)}' ${ATOM_LINE_EXTEND} ${pipeline}`,
		options: { startTime, endTime: "now" },
	});
};
