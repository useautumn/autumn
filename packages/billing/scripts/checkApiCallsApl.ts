/**
 * One-off accuracy check for the generated api_call query.
 *
 *   bun scripts/checkApiCallsApl.ts --hour 2026-09-27T11 [--org org_123] [--rows]
 *
 * A: the generated summarize query (what the meter would push).
 * B: Axiom groups the same hour by (org, method, url, batch size); each distinct
 *    url is classified locally with routeToEndpoint and the counts summed.
 * Prints both and every (org, endpoint) where they disagree. Read-only.
 * Needs AXIOM_ADMIN_TOKEN and AXIOM_ORG_ID in the environment.
 */

import { createAxiomClient, queryApl } from "@autumn/axiom";
import { countApiCalls } from "../src/apiRequests/actions/countApiCalls/countApiCalls";
import { apiCallLogFields as f } from "../src/apiRequests/utils/apiCallsApl";
import { routeToEndpoint } from "../src/apiRequests/utils/routeToEndpoint";
import type { HourWindow } from "../src/types/hourWindow";

/** Distinct (org, method, url) groups per hour; far fewer than requests. */
const GROUP_ROW_LIMIT = 500_000;

const argValue = (flag: string): string | undefined => {
	const index = process.argv.indexOf(flag);
	return index === -1 ? undefined : process.argv[index + 1];
};

const hourArg = argValue("--hour");
if (!hourArg) throw new Error("--hour YYYY-MM-DDTHH (UTC) is required");
const orgFilter = argValue("--org");
const printRows = process.argv.includes("--rows");

const startMs = Date.parse(`${hourArg}:00:00Z`);
if (Number.isNaN(startMs)) throw new Error(`Bad --hour: ${hourArg}`);
const window: HourWindow = { startMs, endMs: startMs + 60 * 60 * 1000 };

const token = process.env.AXIOM_ADMIN_TOKEN;
if (!token) throw new Error("AXIOM_ADMIN_TOKEN is not set");
const axiom = createAxiomClient({
	config: { token, orgId: process.env.AXIOM_ORG_ID },
});

const orgWhere = orgFilter ? `| where ${f.orgId} == '${orgFilter}'` : "";

// A: what the meter computes.
const generated = await countApiCalls({ ctx: { axiom }, windows: [window] });
const a = new Map<string, number>();
for (const count of generated) {
	if (orgFilter && count.orgId !== orgFilter) continue;
	a.set(`${count.orgId}\t${count.endpointId}`, count.requests);
}

// B: grouped by Axiom, classified here.
const groupedApl = [
	f.dataset,
	`| where ${f.time} >= datetime(${new Date(window.startMs).toISOString()}) and ${f.time} < datetime(${new Date(window.endMs).toISOString()})`,
	`| where ${f.statusCode} >= 200 and ${f.statusCode} < 300`,
	`| where ${f.env} == 'live'`,
	`| where ${f.authType} in ('secret_key', 'customer_jwt')`,
	orgWhere,
	`| summarize calls = count() by org_id = tostring(${f.orgId}), method = tostring(${f.method}), url = tostring(${f.url}), item_count = coalesce(tolong(${f.batchItemCount}), array_length(parse_json(tostring(${f.body}))))`,
	`| limit ${GROUP_ROW_LIMIT}`,
]
	.filter(Boolean)
	.join("\n");
const groups = await queryApl({ ctx: { axiom }, query: { apl: groupedApl } });

const b = new Map<string, number>();
let unmeteredCalls = 0;
let totalCalls = 0;
for (const group of groups) {
	const calls = Number(group.calls);
	totalCalls += calls;
	const endpoint = routeToEndpoint({
		method: String(group.method ?? ""),
		url: String(group.url ?? ""),
	});
	if (!endpoint) {
		unmeteredCalls += calls;
		continue;
	}
	const itemCount = Number(group.item_count);
	const requestsPerCall =
		endpoint.weight === "one_per_item" &&
		Number.isFinite(itemCount) &&
		itemCount > 0
			? itemCount
			: 1;
	const key = `${group.org_id}\t${endpoint.id}`;
	b.set(key, (b.get(key) ?? 0) + calls * requestsPerCall);
}

const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
const mismatches = keys.filter(
	(key) => (a.get(key) ?? 0) !== (b.get(key) ?? 0),
);
const total = (map: Map<string, number>) =>
	[...map.values()].reduce((sum, value) => sum + value, 0);

console.log(
	`hour ${new Date(window.startMs).toISOString()}${orgFilter ? ` org ${orgFilter}` : ""}`,
);
console.log(`A generated: ${a.size} rows, ${total(a)} requests`);
console.log(
	`B grouped:   ${groups.length} (org, method, url) groups = ${totalCalls} calls (${unmeteredCalls} unmetered), ${b.size} rows, ${total(b)} requests`,
);
if (groups.length >= GROUP_ROW_LIMIT) {
	console.log(
		`B hit the ${GROUP_ROW_LIMIT} group limit; narrow with --org before trusting the comparison`,
	);
}
if (printRows) {
	const slugRows = await queryApl({
		ctx: { axiom },
		query: {
			apl: [
				f.dataset,
				`| where ${f.time} >= datetime(${new Date(window.startMs).toISOString()}) and ${f.time} < datetime(${new Date(window.endMs).toISOString()})`,
				`| where isnotempty(${f.orgId})`,
				`| summarize count() by org_id = tostring(${f.orgId}), org_slug = tostring(['context.org_slug'])`,
			].join("\n"),
		},
	});
	const slugByOrg = new Map(
		slugRows.map((row) => [String(row.org_id), String(row.org_slug ?? "")]),
	);
	const table = keys
		.map((key) => {
			const [orgId, endpointId] = key.split("\t");
			return {
				orgId,
				orgSlug: slugByOrg.get(orgId) ?? "",
				endpointId,
				requests: a.get(key) ?? 0,
			};
		})
		.sort((x, y) => y.requests - x.requests);
	const width = (values: string[]) =>
		Math.max(...values.map((value) => value.length));
	const w = {
		orgId: width(table.map((row) => row.orgId).concat("org_id")),
		orgSlug: width(table.map((row) => row.orgSlug).concat("org_slug")),
		endpointId: width(table.map((row) => row.endpointId).concat("endpoint_id")),
	};
	const line = (
		orgId: string,
		orgSlug: string,
		endpointId: string,
		requests: string,
	) =>
		`${orgId.padEnd(w.orgId)}  ${orgSlug.padEnd(w.orgSlug)}  ${endpointId.padEnd(w.endpointId)}  ${requests.padStart(12)}`;
	console.log("");
	console.log(line("org_id", "org_slug", "endpoint_id", "requests"));
	for (const row of table) {
		console.log(
			line(
				row.orgId,
				row.orgSlug,
				row.endpointId,
				row.requests.toLocaleString("en-US"),
			),
		);
	}
	console.log("");
}
if (mismatches.length === 0) {
	console.log("MATCH: A == B for every (org, endpoint)");
} else {
	console.log(
		`MISMATCH on ${mismatches.length} of ${keys.length} (org, endpoint) rows:`,
	);
	console.log("org_id\tendpoint_id\tA\tB");
	for (const key of mismatches)
		console.log(`${key}\t${a.get(key) ?? 0}\t${b.get(key) ?? 0}`);
}
