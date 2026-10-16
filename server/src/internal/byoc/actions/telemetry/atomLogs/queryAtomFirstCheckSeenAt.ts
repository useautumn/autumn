import { axiomStringFrom } from "@/external/axiom/utils/resultUtils.js";
import { ATOM_HEALTH_LINES, queryAtomLogs } from "./queryAtomLogs.js";

/** When the Atom's health first counted a request: unsampled, unlike its request lines, and /health probes never count. */
export const queryAtomFirstCheckSeenAt = async ({
	deploymentId,
	since,
}: {
	deploymentId: string;
	since: number;
}): Promise<number | null> => {
	const [first] = await queryAtomLogs({
		deploymentId,
		startTime: new Date(since).toISOString(),
		pipeline: `
			${ATOM_HEALTH_LINES}
			| where todouble(parse_json(line).data.interval.requests) > 0
			| project _time
			| sort by _time asc
			| take 1`,
	});
	return first ? Date.parse(axiomStringFrom(first._time)) : null;
};
