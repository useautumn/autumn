import { apiRequestCatalog } from "../apiRequestCatalog";
import type { ApiEndpoint } from "../types/apiEndpoint";
import type { ApiRoute, HttpMethod } from "../types/apiRoute";
import { normalizeRequestPath } from "./normalizeRequestPath";

const PARAM_SEGMENT = "[^/]+";

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

const catalogRoutesLiteralFirst = apiRequestCatalog
	.flatMap((endpoint) => endpoint.routes.map((route) => ({ endpoint, route })))
	.sort((a, b) => paramCount(a.route) - paramCount(b.route));

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
