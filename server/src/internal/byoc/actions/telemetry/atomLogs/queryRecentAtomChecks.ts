import type { AtomCheck } from "@autumn/shared";
import { axiomStringFrom } from "@/external/axiom/utils/resultUtils.js";
import { queryAtomLogs } from "./queryAtomLogs.js";

const LOOKBACK = "now-5m";
const LIMIT = 5;

/** The Atom's latest checks whose key got through; a thread logs its first ten in full, so an org's first checks are always here. */
export const queryRecentAtomChecks = async ({
	deploymentId,
}: {
	deploymentId: string;
}): Promise<AtomCheck[]> => {
	const rows = await queryAtomLogs({
		deploymentId,
		startTime: LOOKBACK,
		pipeline: `
			| where body contains '/v1/balances.check'
			| extend line = parse_json(body)
			| where toint(line.statusCode) != 401 and toint(line.statusCode) != 403
			| project _time,
				customer_id = tostring(line.req.customer_id),
				feature_id = tostring(line.req.feature_id),
				forwarded = tostring(line.forwarded)
			| sort by _time desc
			| take ${LIMIT}`,
	});
	return rows.map((row) => ({
		at: Date.parse(axiomStringFrom(row._time)),
		customer_id: axiomStringFrom(row.customer_id) || null,
		feature_id: axiomStringFrom(row.feature_id) || null,
		answered_by: axiomStringFrom(row.forwarded) ? "api" : "atom",
	}));
};
