import { apiRequestCatalog } from "../apiRequestCatalog";
import type { ApiEndpoint } from "../types/apiEndpoint";
import type { ApiRoute, HttpMethod } from "../types/apiRoute";
import { normalizeRequestPath } from "./normalizeRequestPath";

const PARAM_SEGMENT = "[^/]+";

/** Catalog path → regex over the normalised (version-less) path; each `{param}` is one segment. */
export const routePathToRegex = (path: ApiRoute["path"]): RegExp => {
	const escaped = normalizeRequestPath(path).replace(
		/[.*+?^$()|[\]\\]/g,
		"\\$&",
	);
	return new RegExp(`^${escaped.replace(/\{[^}]+\}/g, PARAM_SEGMENT)}$`);
};

const routeMatches = ({
	route,
	method,
	path,
}: {
	route: ApiRoute;
	method: HttpMethod;
	path: string;
}): boolean =>
	route.method === method && routePathToRegex(route.path).test(path);

const paramCount = (route: ApiRoute): number =>
	(route.path.match(/\{[^}]+\}/g) ?? []).length;

/** Literal routes win over parameterised ones, so `/v1/x` never reads as `/v1/{id}`. */
const catalogRoutesLiteralFirst = apiRequestCatalog
	.flatMap((endpoint) => endpoint.routes.map((route) => ({ endpoint, route })))
	.sort((a, b) => paramCount(a.route) - paramCount(b.route));

/** The catalog endpoint a logged request maps to, or null when it isn't metered. */
export const routeToEndpoint = ({
	method,
	url,
}: {
	method: string;
	url: string;
}): ApiEndpoint | null => {
	const path = normalizeRequestPath(url);
	const httpMethod = method.toUpperCase() as HttpMethod;

	return (
		catalogRoutesLiteralFirst.find(({ route }) =>
			routeMatches({ route, method: httpMethod, path }),
		)?.endpoint ?? null
	);
};
