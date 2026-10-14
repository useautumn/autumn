import type { HourWindow } from "../../types/hourWindow";
import { apiRequestCatalog } from "../apiRequestCatalog";
import type { ApiRoute } from "../types/apiRoute";
import {
	normalizeRequestPath,
	pathNormalizationSteps,
} from "./normalizeRequestPath";

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
	batchItemCount: "parse_json(tostring(extras))['item_count']",
	body: "['req.body']",
} as const;

const aplString = (value: string) =>
	`'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

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

const routePredicate = (route: ApiRoute): string => {
	const path = normalizeRequestPath(route.path);
	const method = `${apiCallLogFields.method} == '${route.method}'`;
	if (!hasParams(route)) return `${method} and path == '${path}'`;
	const pattern = `^${escapeRegex(path).replace(/\{[^}]+\}/g, PARAM_SEGMENT)}$`;
	return `${method} and path matches regex '${pattern}'`;
};

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

export const requestsAplExpression = (): string => {
	const perItemIds = apiRequestCatalog
		.filter((endpoint) => endpoint.weight === "one_per_item")
		.map((endpoint) => `'${endpoint.id}'`);
	if (perItemIds.length === 0) return "1";

	const batchSize = `coalesce(tolong(${apiCallLogFields.batchItemCount}), array_length(parse_json(tostring(${apiCallLogFields.body}))), 1)`;
	return `case(endpoint_id in (${perItemIds.join(", ")}), ${batchSize}, 1)`;
};

const BILLABLE_AUTH_TYPES = ["secret_key", "customer_jwt"] as const;
const LIVE_ENV = "live";

const aplDatetime = (ms: number) => `datetime(${new Date(ms).toISOString()})`;
const f = apiCallLogFields;

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
