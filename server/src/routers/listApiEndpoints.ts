import { apiRouter } from "./apiRouter.js";

/** Every `METHOD /v1/path` the public API serves, sorted by path. */
export const listApiEndpoints = (): string[] => {
	const endpoints = apiRouter.routes
		.filter(({ method }) => method !== "ALL")
		.map(({ method, path }) => ({ method, path: `/v1${path}` }))
		.sort(
			(a, b) =>
				a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
		)
		.map(({ method, path }) => `${method} ${path}`);
	return [...new Set(endpoints)];
};
