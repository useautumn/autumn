import type { HourWindow } from "../../types/hourWindow";
import { apiRequestCatalog } from "../apiRequestCatalog";
import type { ApiRoute } from "../types/apiRoute";
import {
	normalizeRequestPath,
	pathNormalizationSteps,
} from "./normalizeRequestPath";

/** Where the `express` request log keeps what the meter reads. One place to fix if a field moves. */
export const apiCallLogFields = {
	dataset: "['express']",
	time: "_time",
	statusCode: "statusCode",
	method: "['req.method']",
	url: "['req.url']",
	orgId: "['context.org_id']",
	orgSlug: "['context.org_slug']",
	env: "['context.env']",
	authType: "['context.auth_type']",
	/** `extras` is one JSON string per request; batch handlers will put item_count in it via addToExtraLogs. */
	batchItemCount: "parse_json(tostring(extras))['item_count']",
	/** The logged request body; for batch endpoints it is the JSON array of items. */
	body: "['req.body']",
} as const;

const aplString = (value: string) =>
	`'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** The same normalisation as `normalizeRequestPath`, as nested `replace_regex` calls over `req.url`. */
export const requestPathAplExpression = (): string =>
	pathNormalizationSteps.reduce(
		(expression, step) =>
			`replace_regex(${aplString(step.pattern)}, ${aplString(step.replacement)}, ${expression})`,
		`tostring(${apiCallLogFields.url})`,
	);

const PARAM_SEGMENT = "[^/]+";
const hasParams = (route: ApiRoute) => route.path.includes("{");

const escapeRegex = (value: string) =>
	value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");

/** Predicate for one route over the normalised `path` column; literals use ==, params a regex. */
const routePredicate = (route: ApiRoute): string => {
	const path = normalizeRequestPath(route.path);
	const method = `${apiCallLogFields.method} == '${route.method}'`;
	if (!hasParams(route)) return `${method} and path == '${path}'`;
	const pattern = `^${escapeRegex(path).replace(/\{[^}]+\}/g, PARAM_SEGMENT)}$`;
	return `${method} and path matches regex '${pattern}'`;
};

/**
 * `case(...)` mapping a request to its catalog endpoint id, '' when unmetered.
 * Literal routes are listed before parameterised ones, as in `routeToEndpoint`.
 */
export const endpointIdAplExpression = (): string => {
	const routes = apiRequestCatalog
		.flatMap((endpoint) =>
			endpoint.routes.map((route) => ({ endpoint, route })),
		)
		.sort((a, b) => Number(hasParams(a.route)) - Number(hasParams(b.route)));

	const branches = routes.map(
		({ endpoint, route }) => `${routePredicate(route)}, '${endpoint.id}'`,
	);
	return `case(\n    ${branches.join(",\n    ")},\n    '')`;
};

/** Requests one logged call counts as: the batch size for per-item endpoints, else 1. */
export const requestsAplExpression = (): string => {
	const perItemIds = apiRequestCatalog
		.filter((endpoint) => endpoint.weight === "one_per_item")
		.map((endpoint) => `'${endpoint.id}'`);
	if (perItemIds.length === 0) return "1";

	// Logged item_count first (cheap, never truncated), else the body's array length, else one.
	const batchSize = `coalesce(tolong(${apiCallLogFields.batchItemCount}), array_length(parse_json(tostring(${apiCallLogFields.body}))), 1)`;
	return `case(endpoint_id in (${perItemIds.join(", ")}), ${batchSize}, 1)`;
};

const BILLABLE_AUTH_TYPES = ["secret_key", "customer_jwt"] as const;
const LIVE_ENV = "live";

const aplDatetime = (ms: number) => `datetime(${new Date(ms).toISOString()})`;
const f = apiCallLogFields;

/**
 * Requests per (org, hour, endpoint) over a contiguous set of hour windows.
 * Counts 2xx live traffic on API keys and customer tokens; everything else is
 * the catalog's job. Rows come back as { org_id, org_slug, hour, endpoint_id, requests };
 * the hour is cast to a string because tabular results drop raw time buckets.
 */
export const apiCallsApl = ({ windows }: { windows: HourWindow[] }): string => {
	const startMs = Math.min(...windows.map((window) => window.startMs));
	const endMs = Math.max(...windows.map((window) => window.endMs));
	const authTypes = BILLABLE_AUTH_TYPES.map((type) => `'${type}'`).join(", ");

	return [
		f.dataset,
		`| where ${f.time} >= ${aplDatetime(startMs)} and ${f.time} < ${aplDatetime(endMs)}`,
		`| where ${f.statusCode} >= 200 and ${f.statusCode} < 300`,
		`| where ${f.env} == '${LIVE_ENV}'`,
		`| where ${f.authType} in (${authTypes})`,
		`| extend path = ${requestPathAplExpression()}`,
		`| extend endpoint_id = ${endpointIdAplExpression()}`,
		"| where endpoint_id != ''",
		`| extend requests = ${requestsAplExpression()}`,
		`| summarize requests = sum(requests) by org_id = tostring(${f.orgId}), org_slug = tostring(${f.orgSlug}), hour = tostring(bin(${f.time}, 1h)), endpoint_id`,
	].join("\n");
};
