import type { AtomCheck } from "@autumn/shared";
import { axiomStringFrom } from "@/external/axiom/utils/resultUtils.js";
import { queryAtomLogs } from "./queryAtomLogs.js";

const LIMIT = 5;

/** The Atom's latest logged checks whose key got through since `since`; past a thread's first ten, only 1% are logged. */
export const queryRecentAtomChecks = async ({
	deploymentId,
	since,
}: {
	deploymentId: string;
	since: number;
}): Promise<AtomCheck[]> => {
	const rows = await queryAtomLogs({
		deploymentId,
		startTime: new Date(since).toISOString(),
		pipeline: `
			| where line contains '/v1/balances.check'
			| extend check = parse_json(line)
			| where toint(check.statusCode) != 401 and toint(check.statusCode) != 403
			| project _time,
				customer_id = tostring(check.req.customer_id),
				feature_id = tostring(check.req.feature_id),
				forwarded = tostring(check.forwarded)
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
