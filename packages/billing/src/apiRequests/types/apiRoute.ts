export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** A public route. `{param}` segments match any single path segment. */
export type ApiRoute = {
	method: HttpMethod;
	path: `/v1/${string}`;
};
