import { getAtomAxiomClient } from "@/external/axiom/initAxiom.js";
import { queryAxiomTabular } from "@/external/axiom/queryAxiom.js";
import { escapeApl } from "@/external/axiom/utils/aplUtils.js";

const ATOM_LOGS_DATASET = "atom";

export const ATOM_LINE_EXTEND = `| extend line = iff(isnotempty(tostring(['attributes.log.record.original'])), tostring(['attributes.log.record.original']), tostring(body))`;

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
